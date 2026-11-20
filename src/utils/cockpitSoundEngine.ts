/**
 * Cockpit Sound Synthesizer & Audio Engine
 * Uses Web Audio API to generate authentic flight deck sounds:
 * - Mechanical switch & toggle clicks
 * - Jet turbine startup whine & spool-up
 * - Continuous low-frequency jet rumble & high-bypass fan whine
 * - APU 400Hz inverter hum
 */

class CockpitSoundEngine {
  private ctx: AudioContext | null = null;
  private engineGain: GainNode | null = null;
  private whineOsc: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private rumbleSource: AudioBufferSourceNode | null = null;
  private rumbleFilter: BiquadFilterNode | null = null;
  private isEngineRunning = false;
  private currentN1 = 0;

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
    return this.ctx;
  }

  /**
   * Tactile mechanical switch click (played on toggling buttons/switches)
   */
  public playSwitchClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // ignore
    }
  }

  /**
   * APU 400Hz AC Electrical Inverter Hum
   */
  public playApuStart(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 1.8);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 1.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 3.1);
    } catch {
      // ignore
    }
  }

  /**
   * Jet Engine Startup Whine & Spool-Up
   */
  public startEngine(initialN1 = 20): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.isEngineRunning) return;

    try {
      this.isEngineRunning = true;
      this.currentN1 = initialN1;
      const now = ctx.currentTime;

      // Master engine gain
      this.engineGain = ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.01, now);
      this.engineGain.gain.linearRampToValueAtTime(0.28, now + 2.5);
      this.engineGain.connect(ctx.destination);

      // 1. High-frequency turbine bypass whine
      this.whineOsc = ctx.createOscillator();
      this.whineGain = ctx.createGain();
      this.whineOsc.type = "sawtooth";

      // Startup frequency sweep (120 Hz -> ~600 Hz for idle)
      this.whineOsc.frequency.setValueAtTime(120, now);
      this.whineOsc.frequency.exponentialRampToValueAtTime(580, now + 2.8);

      const whineFilter = ctx.createBiquadFilter();
      whineFilter.type = "lowpass";
      whineFilter.frequency.setValueAtTime(900, now);

      this.whineGain.gain.setValueAtTime(0.08, now);

      this.whineOsc.connect(whineFilter);
      whineFilter.connect(this.whineGain);
      this.whineGain.connect(this.engineGain);
      this.whineOsc.start(now);

      // 2. Continuous low-frequency jet combustion rumble
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.05 * white) / 1.05;
        data[i] = lastOut * 3.5;
      }

      this.rumbleSource = ctx.createBufferSource();
      this.rumbleSource.buffer = noiseBuffer;
      this.rumbleSource.loop = true;

      this.rumbleFilter = ctx.createBiquadFilter();
      this.rumbleFilter.type = "bandpass";
      this.rumbleFilter.frequency.setValueAtTime(140, now);
      this.rumbleFilter.Q.setValueAtTime(2.2, now);

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.35, now);

      this.rumbleSource.connect(this.rumbleFilter);
      this.rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(this.engineGain);
      this.rumbleSource.start(now);
    } catch (e) {
      console.warn("CockpitSoundEngine engine start failed:", e);
    }
  }

  /**
   * Modulate engine sound pitch and volume based on N1%
   */
  public updateEngineN1(n1Pct: number): void {
    if (!this.isEngineRunning || !this.ctx) return;
    this.currentN1 = n1Pct;

    try {
      const now = this.ctx.currentTime;
      // N1 ranges 0..100%
      // Whine frequency ranges ~300 Hz (idle 20%) to ~1600 Hz (TOGA 100%)
      const targetFreq = 260 + (n1Pct / 100) * 1350;
      if (this.whineOsc) {
        this.whineOsc.frequency.setTargetAtTime(targetFreq, now, 0.25);
      }

      // Rumble filter cutoff ranges 120 Hz (idle) to 380 Hz (TOGA)
      const targetRumble = 110 + (n1Pct / 100) * 270;
      if (this.rumbleFilter) {
        this.rumbleFilter.frequency.setTargetAtTime(targetRumble, now, 0.3);
      }

      // Volume increases with thrust
      const targetGain = 0.22 + (n1Pct / 100) * 0.45;
      if (this.engineGain) {
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.2);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Stop engine sound and spool down smoothly
   */
  public stopEngine(): void {
    if (!this.isEngineRunning || !this.ctx) return;
    this.isEngineRunning = false;

    try {
      const now = this.ctx.currentTime;
      if (this.engineGain) {
        this.engineGain.gain.linearRampToValueAtTime(0.001, now + 1.5);
      }
      setTimeout(() => {
        try {
          this.whineOsc?.stop();
          this.whineOsc?.disconnect();
          this.whineOsc = null;
          this.rumbleSource?.stop();
          this.rumbleSource?.disconnect();
          this.rumbleSource = null;
          this.engineGain?.disconnect();
          this.engineGain = null;
        } catch {
          // ignore
        }
      }, 1600);
    } catch {
      // ignore
    }
  }
}

export const cockpitSound = new CockpitSoundEngine();
