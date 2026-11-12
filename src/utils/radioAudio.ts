import {
  AIRLINE_TELEPHONY,
  DIGIT_WORDS,
  ICAO_LETTER_MAP,
  formatFixIcao,
  spellDigitsIcao,
  spellLettersIcao,
} from "./natoPhonetics.ts";
import type { ActiveRadioTransmission } from "./radioSignals.ts";

function formatAltitudeWord(altStr: string): string {
  const num = Number(altStr);
  if (!Number.isFinite(num) || num < 1000) return spellDigitsIcao(altStr);
  const thousands = Math.floor(num / 1000);
  const hundreds = Math.floor((num % 1000) / 100);
  const thWord =
    thousands >= 10
      ? spellDigitsIcao(String(thousands))
      : DIGIT_WORDS[String(thousands)]?.toLowerCase() ?? String(thousands);
  if (hundreds === 0) {
    return `${thWord} thousand`;
  }
  const hWord = DIGIT_WORDS[String(hundreds)]?.toLowerCase() ?? String(hundreds);
  return `${thWord} thousand ${hWord} hundred`;
}

/**
 * Converts written ATC log text into authentic ICAO/FAA spoken aviation phraseology
 * using the complete 26-letter NATO/ICAO Phonetic Alphabet, "niner", digit-by-digit
 * callsigns/headings, and aviation altitude phrasing.
 */
export function formatAtcSpeech(rawText: string): string {
  let text = rawText.replace(/\[[^\]]*\]/g, "").trim();
  if (!text) return "";

  // Standard abbreviations
  text = text.replace(/\bRWY\b/gi, "runway");
  text = text.replace(/\b([KVELWOPZRH][A-Z]{3})\b/g, (icao) => {
    const knownIcaoWords = new Set(["HOLD", "LEFT", "LINE", "WAIT", "TAXI", "STOP", "SLOW", "PUSH", "GATE", "WITH", "NONE", "MODE", "TEST", "ZERO", "FIVE", "FOUR", "NINE"]);
    return knownIcaoWords.has(icao) ? icao : spellLettersIcao(icao);
  });

  // Runway identifiers with side (09L, 27R, 14C) or preceded by "runway" (e.g. runway 29, runway 09)
  text = text.replace(/\b(0[1-9]|[12]\d|3[0-6])([LRC])\b/gi, (_m, nums: string, side: string) => {
    const s = side.toUpperCase();
    const sideWord = s === "L" ? " left" : s === "R" ? " right" : " center";
    return `${spellDigitsIcao(nums)}${sideWord}`;
  });
  text = text.replace(/\brunway\s+(0[1-9]|[12]\d|3[0-6])\b/gi, (_m, nums: string) => {
    return `runway ${spellDigitsIcao(nums)}`;
  });

  // Spoken "nine" -> "niner"
  text = text.replace(/\bnine\b/gi, "niner");

  // Named fixes with digits (e.g. IF09L, IF08L, IF09, ASTER1, ALPINE1)
  text = text.replace(/\b(IF09L|IF09R|IF08L|IF08R|IF09|IF27L|IF27R)\b/gi, (m) => formatFixIcao(m));
  text = text.replace(/\b([A-Z]{4,6})(\d{1,2})\b/g, (m) => formatFixIcao(m));

  // Airline 3-letter ICAO callsigns (e.g. UAL452 -> United four five two)
  text = text.replace(/\b([A-Z]{3})(\d{1,4})\b/g, (full, code: string, num: string) => {
    const telephony = AIRLINE_TELEPHONY[code];
    if (telephony) {
      return `${telephony} ${spellDigitsIcao(num)}`;
    }
    return `${spellLettersIcao(code)} ${spellDigitsIcao(num)}`;
  });

  // Alphanumeric gates / tail numbers / short codes (e.g. B12, A1, S3, N732AB, J4)
  text = text.replace(
    /\b([A-Z]{1,2})(\d{1,4})([A-Z]{0,2})\b/g,
    (_m, lead: string, digits: string, tail: string) => {
      const parts = [spellLettersIcao(lead), spellDigitsIcao(digits)];
      if (tail) parts.push(spellLettersIcao(tail));
      return parts.join(" ");
    }
  );

  // Single uppercase letters in ATC context (e.g. "Taxiway A", "via A, B", "Gate K")
  text = text.replace(
    /\b(taxiway|via|gate|stand|concourse|intersection|sector)\s+([A-Z])(?:\s*,\s*([A-Z]))?(?:\s*,\s*([A-Z]))?\b/gi,
    (_m, prefix: string, l1: string, l2?: string, l3?: string) => {
      const words = [l1, l2, l3]
        .filter((x): x is string => Boolean(x))
        .map((ch) => ICAO_LETTER_MAP[ch.toUpperCase()] ?? ch);
      return `${prefix} ${words.join(", ")}`;
    }
  );

  // Standalone single uppercase letters B-H, J-Z (avoid lowercase prose words)
  text = text.replace(/\b([B-HJ-Z])\b/g, (m) => ICAO_LETTER_MAP[m] ?? m);

  // Spoken "I L S" after single-letter expansion so L/S aren't turned into Lima Sierra
  text = text.replace(/\bILS\b/gi, "I L S");

  // Squawk codes (e.g. "squawk 7600" -> "squawk seven six zero zero")
  text = text.replace(/\bsquawk\s+(\d{4})\b/gi, (_m, code: string) => `squawk ${spellDigitsIcao(code)}`);

  // Altitudes (4 or 5 digit numbers ending in 00, e.g. 2500, 3000, 10000)
  text = text.replace(/\b(1\d{4}|[1-9]\d00)\b/g, (m) => formatAltitudeWord(m));

  // Headings / speeds / flight numbers (2-4 digits not already handled)
  text = text.replace(/\b\d{2,4}\b/g, (m) => spellDigitsIcao(m));

  // Single digits like wind "at 8" -> "at eight", "9" -> "niner"
  text = text.replace(/\b([0-9])\b/g, (m) => DIGIT_WORDS[m]?.toLowerCase() ?? m);

  // Units
  text = text.replace(/\bkts?\b/gi, "knots");
  text = text.replace(/\bft\b/gi, "feet");

  return text.replace(/\s+/g, " ").trim();
}

export interface RankedVoice {
  voice: SpeechSynthesisVoice;
  quality: "NEURAL" | "CLOUD" | "LOCAL";
  score: number;
  genderHint: "M" | "F" | "U";
}

function inferGenderHint(name: string): "M" | "F" | "U" {
  const n = name.toLowerCase();
  if (/(guy|christopher|eric|steffan|ryan|liam|william|daniel|alex|arthur|oliver|david|mark|george|male)/.test(n)) {
    return "M";
  }
  if (/(aria|jenny|sonia|libby|clara|natasha|samantha|ava|allison|karen|zira|hazel|susan|female)/.test(n)) {
    return "F";
  }
  return "U";
}

export function scoreSpeechVoice(v: SpeechSynthesisVoice): RankedVoice {
  const name = v.name;
  const lang = v.lang.toLowerCase();
  let score = 0;
  let quality: RankedVoice["quality"] = "LOCAL";

  if (!lang.startsWith("en")) {
    score -= 1000;
  } else if (lang === "en-us" || lang === "en-gb" || lang === "en-ca" || lang === "en-au") {
    score += 20;
  }

  if (/natural|neural|online/i.test(name)) {
    score += 120;
    quality = "NEURAL";
  } else if (/google/i.test(name)) {
    score += 95;
    quality = "CLOUD";
  } else if (!v.localService) {
    score += 75;
    quality = "CLOUD";
  } else if (/samantha|daniel|alex|ava|allison|arthur|oliver|karen/i.test(name)) {
    score += 45;
  } else if (/microsoft mark/i.test(name)) {
    score += 18;
  } else if (/david|zira|hazel|george|susan|espeak/i.test(name)) {
    score -= 25;
  }

  return {
    voice: v,
    quality,
    score,
    genderHint: inferGenderHint(name),
  };
}

interface QueuedSpeechItem {
  text: string;
  rawText: string;
  role: "CONTROLLER" | "PILOT";
  speakerKey: string;
  priority: boolean;
  forceLocal?: boolean;
}

function makeSoftClipCurve(drive = 2.4): Float32Array<ArrayBuffer> {
  const n = 512;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}

export function computePilotSpeechProfile(
  speakerKey: string,
  isNeuralOrCloud: boolean,
  baseRate = 1.15
): { pitch: number; rate: number } {
  let hash = 0;
  for (let i = 0; i < speakerKey.length; i++) {
    hash = (hash * 31 + speakerKey.charCodeAt(i)) >>> 0;
  }
  // Subtle natural pilot-to-pilot variation without robotic extremes on SAPI voices
  const norm = ((hash % 100) / 99) * 2 - 1; // [-1, 1]
  const pitch = isNeuralOrCloud
    ? Number((1.0 + norm * 0.12).toFixed(2)) // 0.88 .. 1.12
    : Number((1.0 + norm * 0.04).toFixed(2)); // 0.96 .. 1.04
  const rateOffset = (((hash >>> 8) % 13) / 100); // 0.00 .. 0.12
  const rate = Number(Math.max(1.0, Math.min(1.35, baseRate + rateOffset)).toFixed(2));
  return { pitch, rate };
}

class RadioAudioEngine {
  private ctx: AudioContext | null = null;
  private vhfBusInput: AudioNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private carrierNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  public sfxEnabled = true;
  public voiceEnabled = true;
  public radioStaticLevel = 0.65; // 0..1
  public rogerBeepEnabled = true;
  public pilotRateBase = 1.15;
  public tunedStationOnly = true;

  public preferredControllerVoiceURI = "AUTO";
  public preferredPilotVoiceURI = "AUTO";

  private rankedVoices: RankedVoice[] = [];
  private queue: QueuedSpeechItem[] = [];
  private speaking = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeTransmission: ActiveRadioTransmission | null = null;
  private speechToken = 0;
  private safetyTimer: number | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.refreshVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.refreshVoices();
      };
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  public refreshVoices(): RankedVoice[] {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return [];
    }
    const raw = window.speechSynthesis.getVoices();
    const english = raw
      .filter((v) => v.lang.toLowerCase().startsWith("en"))
      .map(scoreSpeechVoice)
      .sort((a, b) => b.score - a.score);
    this.rankedVoices = english;
    this.notify();
    return english;
  }

  public getAvailableVoices(): RankedVoice[] {
    if (this.rankedVoices.length === 0) {
      this.refreshVoices();
    }
    return this.rankedVoices;
  }

  public getActiveTransmission(): ActiveRadioTransmission | null {
    return this.activeTransmission;
  }

  public getEffectiveControllerVoice(): RankedVoice | null {
    const voices = this.getAvailableVoices();
    if (voices.length === 0) return null;
    if (this.preferredControllerVoiceURI !== "AUTO") {
      const found = voices.find((v) => v.voice.voiceURI === this.preferredControllerVoiceURI);
      if (found) return found;
    }
    // Prefer authoritative top male natural/cloud voice for Tower/Ground/Dep
    const topScore = voices[0].score;
    const maleTop = voices.find((v) => v.genderHint === "M" && v.score >= topScore - 20);
    return maleTop ?? voices[0];
  }

  private pickVoiceForItem(role: "CONTROLLER" | "PILOT", speakerKey: string): RankedVoice | null {
    const voices = this.getAvailableVoices();
    if (voices.length === 0) return null;

    if (role === "CONTROLLER") {
      return this.getEffectiveControllerVoice();
    }

    if (this.preferredPilotVoiceURI !== "AUTO") {
      const found = voices.find((v) => v.voice.voiceURI === this.preferredPilotVoiceURI);
      if (found) return found;
    }

    // Use top quality voices for pilots, avoiding identical voice to controller when possible
    const ctrl = this.getEffectiveControllerVoice();
    const minScore = Math.max(0, voices[0].score - 35);
    const pool = voices.filter(
      (v) => v.score >= minScore && (voices.length === 1 || v.voice.voiceURI !== ctrl?.voice.voiceURI)
    );
    const candidates = pool.length > 0 ? pool : voices;
    let hash = 0;
    for (let i = 0; i < speakerKey.length; i++) {
      hash = (hash * 31 + speakerKey.charCodeAt(i)) >>> 0;
    }
    return candidates[hash % candidates.length];
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const length = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        // Mild pink-ish smoothing so VHF static sounds warm rather than harsh hiss
        lastOut = (lastOut + 0.08 * white) / 1.08;
        data[i] = white * 0.55 + lastOut * 1.4;
      }
      this.noiseBuffer = buf;
    }
    if (!this.vhfBusInput && this.ctx) {
      try {
        // Real aviation VHF filter bus: 300 Hz HP -> 1500 Hz Bandpass -> Soft-Clipper -> Compressor
        const input = this.ctx.createGain();
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(300, this.ctx.currentTime);

        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1500, this.ctx.currentTime);
        bp.Q.setValueAtTime(1.65, this.ctx.currentTime);

        const shaper = this.ctx.createWaveShaper();
        shaper.curve = makeSoftClipCurve(2.2);
        shaper.oversample = "2x";

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-24, this.ctx.currentTime);
        comp.knee.setValueAtTime(10, this.ctx.currentTime);
        comp.ratio.setValueAtTime(6, this.ctx.currentTime);
        comp.attack.setValueAtTime(0.003, this.ctx.currentTime);
        comp.release.setValueAtTime(0.12, this.ctx.currentTime);

        input.connect(hp);
        hp.connect(bp);
        bp.connect(shaper);
        shaper.connect(comp);
        comp.connect(this.ctx.destination);
        this.vhfBusInput = input;
      } catch {
        this.vhfBusInput = this.ctx.destination;
      }
    }
    return this.ctx;
  }

  private getOutputNode(ctx: AudioContext): AudioNode {
    return this.vhfBusInput ?? ctx.destination;
  }

  private playVhfBurst(durationSec: number, gainPeak: number, freqHz: number, q = 1.6): void {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    try {
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(freqHz, now);
      bp.Q.setValueAtTime(q, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.getOutputNode(ctx));
      src.start(now, Math.random() * 1.2);
      src.stop(now + durationSec + 0.01);
    } catch {
      // Ignore audio errors
    }
  }

  private playRogerBeep(): void {
    if (!this.sfxEnabled || !this.rogerBeepEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1320, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.032, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);
      osc.connect(gain);
      gain.connect(this.getOutputNode(ctx));
      osc.start(now);
      osc.stop(now + 0.048);
    } catch {
      // Ignore
    }
  }

  public startCarrierStatic(): void {
    this.stopCarrierStatic();
    if (!this.sfxEnabled || this.radioStaticLevel <= 0.02) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    try {
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(340, now);

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1450, now);
      bp.Q.setValueAtTime(1.5, now);

      const gain = ctx.createGain();
      const level = 0.032 * this.radioStaticLevel;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.025);

      src.connect(hp);
      hp.connect(bp);
      bp.connect(gain);
      gain.connect(this.getOutputNode(ctx));
      src.start(now, Math.random());

      this.carrierNodes = { src, gain };
    } catch {
      // Ignore audio errors
    }
  }

  public stopCarrierStatic(): void {
    if (!this.carrierNodes) return;
    try {
      const { src, gain } = this.carrierNodes;
      const ctx = this.ctx;
      if (ctx) {
        const now = ctx.currentTime;
        gain.gain.setTargetAtTime(0.0001, now, 0.015);
        src.stop(now + 0.06);
      } else {
        src.stop();
      }
    } catch {
      // Already stopped
    }
    this.carrierNodes = null;
  }

  public playRadioClick(kind: "ATC" | "PILOT" | "ALERT" | "ERROR"): void {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (kind === "ATC") {
      // Crisp tower PTT mic key-up click + short VHF burst
      this.playVhfBurst(0.045, 0.06 * Math.max(0.35, this.radioStaticLevel), 1650, 1.8);
      return;
    }

    if (kind === "PILOT") {
      // Slightly thinner cockpit handheld mic key-up
      this.playVhfBurst(0.04, 0.05 * Math.max(0.35, this.radioStaticLevel), 1950, 2.1);
      return;
    }

    // ALERT / ERROR: clean aviation caution two-tone chime
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(kind === "ERROR" ? 740 : 880, now);
      osc.frequency.setValueAtTime(kind === "ERROR" ? 554 : 660, now + 0.09);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {
      // Ignore
    }
  }

  public speakRadio(
    text: string,
    roleOrIsPilot: boolean | "CONTROLLER" | "PILOT",
    speakerKey = "DEFAULT",
    priority = false
  ): void {
    if (
      !this.voiceEnabled ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    const role: "CONTROLLER" | "PILOT" =
      typeof roleOrIsPilot === "boolean"
        ? roleOrIsPilot
          ? "PILOT"
          : "CONTROLLER"
        : roleOrIsPilot;

    const formatted = formatAtcSpeech(text);
    if (!formatted) return;

    // Keep queue responsive without ever dropping priority readbacks/clearances unless huge backlog
    if (this.queue.length >= 6) {
      const nonPriorityIdx = this.queue.findIndex((q) => !q.priority);
      if (nonPriorityIdx >= 0) {
        this.queue.splice(nonPriorityIdx, 1);
      } else if (this.queue.length >= 10) {
        this.queue.shift();
      }
    }
    this.queue.push({ text: formatted, rawText: text, role, speakerKey, priority });
    this.drainQueue();
  }

  public stopAllSpeech(): void {
    this.speechToken += 1;
    this.queue = [];
    this.speaking = false;
    this.activeUtterance = null;
    this.activeTransmission = null;
    this.stopCarrierStatic();
    if (this.safetyTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.notify();
  }

  private drainQueue(): void {
    if (this.speaking || this.queue.length === 0) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const item = this.queue.shift()!;
    this.speaking = true;
    const myToken = ++this.speechToken;
    this.activeTransmission = {
      speakerKey: item.speakerKey,
      role: item.role,
      rawText: item.rawText,
      startedAtMs: Date.now(),
    };
    this.notify();

    try {
      const utter = new SpeechSynthesisUtterance(item.text);
      // Retain strong reference so Chromium doesn't GC utterance before onend!
      this.activeUtterance = utter;

      let picked = this.pickVoiceForItem(item.role, item.speakerKey);
      if (item.forceLocal) {
        const localVoice = this.getAvailableVoices().find((v) => v.voice.localService);
        if (localVoice) picked = localVoice;
      }
      if (picked) {
        utter.voice = picked.voice;
        utter.lang = picked.voice.lang;
      }

      // Use distinct pilot cadence (brisk real-world ATC/cockpit rate + deterministic per-plane pitch)
      const isNeuralOrCloud = Boolean(picked && picked.quality !== "LOCAL");
      if (item.role === "CONTROLLER") {
        utter.rate = Math.max(1.0, Math.min(1.3, this.pilotRateBase - 0.05));
        utter.pitch = isNeuralOrCloud ? 0.96 : 1.0;
      } else {
        const prof = computePilotSpeechProfile(
          item.speakerKey,
          isNeuralOrCloud,
          this.pilotRateBase
        );
        utter.rate = prof.rate;
        utter.pitch = prof.pitch;
      }
      utter.volume = 0.88;

      const finish = (playSquelch: boolean) => {
        if (this.speechToken !== myToken) return;
        if (this.safetyTimer !== null) {
          window.clearTimeout(this.safetyTimer);
          this.safetyTimer = null;
        }
        this.activeUtterance = null;
        this.activeTransmission = null;
        this.stopCarrierStatic();
        if (playSquelch && this.sfxEnabled) {
          this.playRogerBeep();
          if (this.radioStaticLevel > 0.05) {
            // Authentic VHF squelch tail at end of transmission
            this.playVhfBurst(0.075, 0.055 * this.radioStaticLevel, 1750, 1.4);
          }
        }
        this.speaking = false;
        this.notify();
        window.setTimeout(() => this.drainQueue(), 90);
      };

      utter.onstart = () => {
        if (this.speechToken !== myToken) return;
        this.playVhfBurst(0.038, 0.05 * Math.max(0.3, this.radioStaticLevel), 1600, 1.8);
        this.startCarrierStatic();
      };
      utter.onend = () => finish(true);
      utter.onerror = () => {
        // If a cloud/online voice fails (e.g. offline), retry once on a local voice
        if (!item.forceLocal && picked && !picked.voice.localService) {
          this.queue.unshift({ ...item, forceLocal: true });
        }
        finish(false);
      };

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Guard against browser speechSynthesis stalls
      this.safetyTimer = window.setTimeout(() => finish(false), 12000);
      window.speechSynthesis.speak(utter);
    } catch {
      this.activeUtterance = null;
      this.activeTransmission = null;
      this.stopCarrierStatic();
      this.speaking = false;
      this.notify();
    }
  }
}

export const radioAudio = new RadioAudioEngine();
