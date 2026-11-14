interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export interface PttCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (reason: string) => void;
}

/**
 * Lightweight wrapper over Web SpeechRecognition (zero API key, free browser STT)
 * configured for Hold-to-Talk (PTT) ATC transmissions.
 */
class SpeechRecognitionPttController {
  private recognition: SpeechRecognitionInstanceLike | null = null;
  private active = false;
  private lastTranscript = "";
  private finalized = false;
  private stopTimeout: ReturnType<typeof setTimeout> | null = null;
  private callbacks: PttCallbacks = {};

  public isListening(): boolean {
    return this.active;
  }

  public getLatestTranscript(): string {
    return this.lastTranscript.trim();
  }

  public start(callbacks: PttCallbacks): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError?.(
        "Microphone SpeechRecognition is only available in Chromium/Edge/Safari browsers."
      );
      return false;
    }

    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }

    if (this.active && this.recognition) return true;

    this.callbacks = callbacks;
    this.lastTranscript = "";
    this.finalized = false;

    try {
      const rec = new Ctor();
      // Detect browser language (e.g. en-IN, en-GB, en-US) for natural accent capture
      const navLang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
      rec.lang = navLang.toLowerCase().startsWith("en") ? navLang : "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onresult = (ev) => {
        const parts: string[] = [];
        for (let i = 0; i < ev.results.length; i++) {
          const item = ev.results[i];
          const text = item?.[0]?.transcript;
          if (text) parts.push(text.trim());
        }
        const combined = parts.join(" ").trim();
        if (combined) {
          this.lastTranscript = combined;
          this.callbacks.onInterim?.(combined);
        }
      };

      rec.onerror = (ev) => {
        const err = ev?.error ?? "speech-error";
        // Ignore expected benign teardown events when microphone is released
        if (err === "no-speech" || err === "aborted") return;
        if (this.finalized) return;
        this.active = false;
        this.callbacks.onError?.(
          err === "not-allowed"
            ? "Microphone permission denied."
            : `Voice recognition error: ${err}`
        );
      };

      rec.onend = () => {
        this.active = false;
        if (this.stopTimeout) {
          clearTimeout(this.stopTimeout);
          this.stopTimeout = null;
        }
        if (!this.finalized) {
          this.finalized = true;
          this.callbacks.onFinal?.(this.lastTranscript.trim());
        }
      };

      this.recognition = rec;
      this.active = true;
      rec.start();
      return true;
    } catch {
      this.active = false;
      callbacks.onError?.("Could not start browser SpeechRecognition microphone.");
      return false;
    }
  }

  /**
   * Stops recording gracefully, allowing the speech engine to finish decoding the final audio
   * and delivering the complete transcript to onFinal.
   */
  public stop(): string {
    const transcript = this.lastTranscript.trim();
    const rec = this.recognition;
    this.active = false;

    if (rec) {
      try {
        rec.stop();
      } catch {
        // Safe ignore
      }

      // Safety timeout: if onend does not fire within 400ms, finalize immediately with last transcript
      if (!this.finalized && !this.stopTimeout) {
        this.stopTimeout = setTimeout(() => {
          this.stopTimeout = null;
          if (!this.finalized) {
            this.finalized = true;
            this.recognition = null;
            this.callbacks.onFinal?.(this.lastTranscript.trim());
          }
        }, 400);
      }
    } else if (!this.finalized) {
      this.finalized = true;
      this.callbacks.onFinal?.(transcript);
    }

    return transcript;
  }
}

export const speechPtt = new SpeechRecognitionPttController();
