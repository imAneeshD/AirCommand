import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, CheckCircle2, AlertTriangle, Radio } from "lucide-react";
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
  const currentTranscriptRef = useRef("");
  const executedThisTurnRef = useRef(false);

  const supported = isBrowserSpeechRecognitionSupported();

  const showToast = useCallback((ok: boolean, text: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ ok, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  const executeTranscript = useCallback(
    (rawText: string) => {
      if (executedThisTurnRef.current) return;
      executedThisTurnRef.current = true;

      const trimmed = rawText.trim();
      if (!trimmed) {
        showToast(false, "No voice command heard — hold V clearly while speaking.");
        return;
      }
      try {
        window.dispatchEvent(
          new CustomEvent("atc:voice-transcript", { detail: trimmed })
        );
      } catch {
        // Safe ignore
      }
      const parsed = parseAtcVoiceCommand(trimmed, useAtcStore.getState().sim);
      if (!parsed.ok) {
        showToast(false, parsed.reason);
        return;
      }
      selectAircraft(parsed.aircraftId);
      const res = issueClearance(parsed.command, true);
      if (res && !res.ok) {
        showToast(false, res.reason || "Clearance rejected by ATC rules");
      } else {
        showToast(true, `Executed: ${parsed.summary}`);
      }
    },
    [issueClearance, selectAircraft, showToast]
  );

  const startPtt = useCallback(() => {
    if (pttHeldRef.current) return;
    pttHeldRef.current = true;
    executedThisTurnRef.current = false;
    currentTranscriptRef.current = "";
    radioAudio.stopAllSpeech();
    radioAudio.playRadioClick("ATC");
    radioAudio.startCarrierStatic();
    setInterimText("");

    const started = speechPtt.start({
      onInterim: (text) => {
        currentTranscriptRef.current = text;
        setInterimText(text);
      },
      onFinal: (finalText) => {
        radioAudio.stopCarrierStatic();
        setListening(false);
        setInterimText("");
        pttHeldRef.current = false;
        const toRun = (finalText || currentTranscriptRef.current).trim();
        if (toRun && !executedThisTurnRef.current) {
          executeTranscript(toRun);
        }
      },
      onError: (err) => {
        radioAudio.stopCarrierStatic();
        setListening(false);
        setInterimText("");
        pttHeldRef.current = false;
        const captured = currentTranscriptRef.current.trim();
        if (captured && !executedThisTurnRef.current) {
          executeTranscript(captured);
        } else if (!executedThisTurnRef.current) {
          showToast(false, err);
        }
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
    if (!pttHeldRef.current && !speechPtt.isListening() && !listening) return;
    pttHeldRef.current = false;
    radioAudio.stopCarrierStatic();
    setListening(false);

    const captured = currentTranscriptRef.current.trim();
    setInterimText("");

    // Stop speech recognition controller and fetch accumulated transcript
    const fromPtt = speechPtt.stop().trim();
    const candidate = fromPtt || captured;

    if (candidate && !executedThisTurnRef.current) {
      executeTranscript(candidate);
    } else {
      // Short delay for final onresult/onend buffer flush
      window.setTimeout(() => {
        if (!executedThisTurnRef.current) {
          const fallback = currentTranscriptRef.current.trim();
          if (fallback) {
            executeTranscript(fallback);
          } else {
            showToast(false, "No voice command heard — hold V clearly while speaking.");
          }
        }
      }, 300);
    }
  }, [executeTranscript, listening, showToast]);

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
          className={`absolute right-0 top-full mt-2 w-80 z-50 p-2.5 rounded-lg border-2 shadow-2xl text-[12px] font-mono select-none ${
            listening
              ? "bg-slate-950 border-red-500 text-white shadow-red-950/60"
              : toast?.ok
              ? "bg-slate-950 border-emerald-500 text-emerald-200 shadow-emerald-950/60"
              : "bg-slate-950 border-amber-500 text-amber-200 shadow-amber-950/60"
          }`}
        >
          {listening ? (
            <div>
              <div className="font-bold flex items-center gap-1.5 text-red-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                <span>MIC LIVE · TRANSMITTING (HOLD [V])</span>
              </div>
              <div className="mt-1.5 px-2 py-1.5 rounded bg-slate-900 border border-red-900/60 text-slate-100 text-[11px] leading-snug">
                {interimText ? (
                  <span className="text-white font-semibold">{interimText}</span>
                ) : (
                  <span className="text-slate-400 italic">Listening... Speak ATC clearance now</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              {toast?.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-snug">
                <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                  {toast?.ok ? "Voice Clearance" : "Clearance Rejected"}
                </div>
                <div className="font-semibold text-white mt-0.5">{toast?.text}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
