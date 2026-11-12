import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import {
  isBrowserSpeechRecognitionSupported,
  speechPtt,
} from "../utils/speechRecognitionPtt.ts";
import { parseAtcVoiceCommand } from "../utils/voiceCommandParser.ts";

/**
 * Push-to-Talk (PTT) Voice Command button & [V] hotkey controller.
 * Hold V (or press-and-hold PTT) to speak ATC clearances via free browser SpeechRecognition.
 */
export const VoicePttButton: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const issueClearance = useAtcStore((s) => s.issueClearance);

  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const pttHeldRef = useRef(false);

  const supported = isBrowserSpeechRecognitionSupported();

  const showToast = useCallback((ok: boolean, text: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ ok, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  const executeTranscript = useCallback(
    (rawText: string) => {
      if (!rawText.trim()) {
        showToast(false, "No voice command heard — hold V clearly while speaking.");
        return;
      }
      const parsed = parseAtcVoiceCommand(rawText, useAtcStore.getState().sim);
      if (!parsed.ok) {
        showToast(false, parsed.reason);
        return;
      }
      selectAircraft(parsed.aircraftId);
      issueClearance(parsed.command);
      showToast(true, `Executed: ${parsed.summary}`);
    },
    [issueClearance, selectAircraft, showToast]
  );

  const startPtt = useCallback(() => {
    if (pttHeldRef.current) return;
    pttHeldRef.current = true;
    radioAudio.stopAllSpeech();
    radioAudio.playRadioClick("ATC");
    radioAudio.startCarrierStatic();
    setInterimText("");

    const started = speechPtt.start({
      onInterim: (text) => setInterimText(text),
      onFinal: (finalText) => {
        radioAudio.stopCarrierStatic();
        setListening(false);
        setInterimText("");
        pttHeldRef.current = false;
        executeTranscript(finalText);
      },
      onError: (err) => {
        radioAudio.stopCarrierStatic();
        setListening(false);
        setInterimText("");
        pttHeldRef.current = false;
        showToast(false, err);
      },
    });
    if (started) {
      setListening(true);
    } else {
      radioAudio.stopCarrierStatic();
      pttHeldRef.current = false;
    }
  }, [executeTranscript, showToast]);

  const stopPtt = useCallback(() => {
    if (!pttHeldRef.current && !speechPtt.isListening()) return;
    pttHeldRef.current = false;
    speechPtt.stop();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.key === "v" || e.key === "V") && !e.repeat) {
        startPtt();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "v" || e.key === "V") {
        stopPtt();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [startPtt, stopPtt]);

  const activeCallsign = sim.selectedAircraftId
    ? sim.aircraft[sim.selectedAircraftId]?.callsign
    : null;

  return (
    <div className="relative flex items-center shrink-0">
      <button
        type="button"
        onMouseDown={startPtt}
        onMouseUp={stopPtt}
        onMouseLeave={() => {
          if (listening) stopPtt();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          startPtt();
        }}
        onTouchEnd={stopPtt}
        title={
          supported
            ? `Hold to transmit ATC Voice Command [Hold Key: V]${activeCallsign ? ` · Selected: ${activeCallsign}` : ""}`
            : "Browser SpeechRecognition unavailable (use typed phrase box in VHF Radio menu)"
        }
        aria-pressed={listening}
        className={`px-2 py-1.5 rounded-md border text-[11px] font-mono font-bold flex items-center gap-1 whitespace-nowrap shadow-sm transition-colors ${
          listening
            ? "bg-red-600 border-red-500 text-white animate-pulse"
            : supported
            ? "border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)]"
            : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[var(--atc-muted)]"
        }`}
      >
        {supported ? (
          <Mic className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <MicOff className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="hidden sm:inline">{listening ? "TX LIVE" : "PTT [V]"}</span>
      </button>

      {(listening || toast) && (
        <div
          className={`absolute right-0 top-full mt-2 w-72 z-50 px-2.5 py-2 rounded-lg border shadow-xl text-[11px] font-mono ${
            listening
              ? "bg-red-950/95 border-red-500 text-white"
              : toast?.ok
              ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
              : "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
          }`}
        >
          {listening ? (
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                MIC HOT — SPEAK CLEARANCE (RELEASE [V])
              </div>
              <div className="mt-1 text-red-100 italic">
                {interimText || 'Say e.g. "Delta 437 cleared for takeoff"'}
              </div>
            </div>
          ) : (
            <div className="font-semibold">{toast?.text}</div>
          )}
        </div>
      )}
    </div>
  );
};
