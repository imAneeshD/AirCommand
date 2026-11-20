/**
 * Automated Cockpit Voice Callout Engine
 * Plays authentic synthetic flight crew calls during takeoff roll:
 * - 80 knots: instrument crosscheck
 * - V1: decision speed / point of no return
 * - Rotate: lift-off rotation speed
 * - Positive rate, gear up: safe climb verification
 */

class PilotVoiceCalloutEngine {
  private spokenCalls = new Set<string>();
  private lastCalloutTimeMs = 0;

  public resetTakeoffCallouts(): void {
    this.spokenCalls.clear();
  }

  public checkAndTriggerCallouts(params: {
    groundSpeedKt: number;
    altitudeAglFt: number;
    verticalSpeedFpm: number;
    v1Speed: number;
    vrSpeed: number;
    voiceEnabled: boolean;
    simTimeSeconds?: number;
  }): string | null {
    if (!params.voiceEnabled) return null;
    const now = params.simTimeSeconds !== undefined ? params.simTimeSeconds * 1000 : Date.now();
    if (now - this.lastCalloutTimeMs < 750) return null;

    const { groundSpeedKt, altitudeAglFt, verticalSpeedFpm, v1Speed, vrSpeed } = params;

    // 1. Positive rate, gear up: airborne climbing
    if (
      !this.spokenCalls.has("POSITIVE_RATE") &&
      altitudeAglFt >= 35 &&
      verticalSpeedFpm >= 120
    ) {
      this.spokenCalls.add("POSITIVE_RATE");
      this.lastCalloutTimeMs = now;
      this.speak("Positive rate, gear up");
      return "Positive rate, gear up";
    }

    // 2. Rotate (Vr)
    if (
      !this.spokenCalls.has("ROTATE") &&
      groundSpeedKt >= vrSpeed &&
      altitudeAglFt < 25
    ) {
      this.spokenCalls.add("ROTATE");
      this.lastCalloutTimeMs = now;
      this.speak("Rotate");
      return "Rotate";
    }

    // 3. V1 (Decision Speed)
    if (
      !this.spokenCalls.has("V1") &&
      groundSpeedKt >= v1Speed &&
      altitudeAglFt < 25
    ) {
      this.spokenCalls.add("V1");
      this.lastCalloutTimeMs = now;
      this.speak("V 1");
      return "V1";
    }

    // 4. 80 knots (Instrument crosscheck)
    if (
      !this.spokenCalls.has("80_KNOTS") &&
      groundSpeedKt >= 80 &&
      groundSpeedKt < v1Speed &&
      altitudeAglFt < 25
    ) {
      this.spokenCalls.add("80_KNOTS");
      this.lastCalloutTimeMs = now;
      this.speak("Eighty knots");
      return "80 knots";
    }

    return null;
  }

  private speak(text: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.15;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      // Prefer a natural English voice
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("David") ||
            v.name.includes("Guy") ||
            v.name.includes("Mark"))
      ) || voices.find((v) => v.lang.startsWith("en"));

      if (match) utter.voice = match;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn("PilotVoiceCalloutEngine speech synthesis failed:", e);
    }
  }
}

export const pilotVoiceCallouts = new PilotVoiceCalloutEngine();
