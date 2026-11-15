import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Keyboard,
  Check,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import { radioAudio } from "../utils/radioAudio.ts";
import {
  isBrowserSpeechRecognitionSupported,
  speechPtt,
} from "../utils/speechRecognitionPtt.ts";
import { parseAtcVoiceCommand } from "../utils/voiceCommandParser.ts";

const PTT_STORAGE_KEY = "aircommand_ptt_key_v1";

export interface PttKeyConfig {
  key: string;
  label: string;
}

const PTT_PRESETS: Array<{ key: string; label: string; desc: string }> = [
  { key: " ", label: "SPACE", desc: "Aviation standard PTT (Recommended)" },
  { key: "v", label: "V", desc: "Default letter key" },
  { key: "Control", label: "CTRL", desc: "Left or Right Control" },
  { key: "Alt", label: "ALT", desc: "Alt modifier key" },
  { key: "`", label: "~ (TILDE)", desc: "Backtick / console key" },
];

function loadSavedPttKey(): PttKeyConfig {
  try {
    const raw = window.localStorage.getItem(PTT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PttKeyConfig;
      if (parsed && typeof parsed.key === "string" && typeof parsed.label === "string") {
        return parsed;
      }
    }
  } catch {
    // Safe ignore
  }
  return { key: "v", label: "V" };
}

function savePttKey(config: PttKeyConfig): void {
  try {
    window.localStorage.setItem(PTT_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Safe ignore
  }
}

/**
 * Push-to-Talk (PTT) Voice Command button & customizable hotkey controller.
 * Supports configurable PTT key (e.g. Spacebar, V, Ctrl, Alt) with e.preventDefault()
 * to prevent hardware volume key or browser default shortcuts from firing.
 */
export const VoicePttButton: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const issueClearance = useAtcStore((s) => s.issueClearance);

  const [pttConfig, setPttConfig] = useState<PttKeyConfig>(loadSavedPttKey);
  const [showKeyMenu, setShowKeyMenu] = useState(false);
  const [isRecordingCustomKey, setIsRecordingCustomKey] = useState(false);

  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const pttHeldRef = useRef(false);
  const currentTranscriptRef = useRef("");
  const executedThisTurnRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const supported = isBrowserSpeechRecognitionSupported();

  // Close keybinding menu when clicking outside
  useEffect(() => {
    if (!showKeyMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowKeyMenu(false);
        setIsRecordingCustomKey(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [showKeyMenu]);

  const selectPttKey = useCallback((config: PttKeyConfig) => {
    setPttConfig(config);
    savePttKey(config);
    setShowKeyMenu(false);
    setIsRecordingCustomKey(false);
  }, []);

  const showToast = useCallback((ok: boolean, text: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ ok, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const executeTranscript = useCallback(
    (rawText: string) => {
      if (executedThisTurnRef.current) return;
      executedThisTurnRef.current = true;

      const trimmed = rawText.trim();
      if (!trimmed) {
        showToast(
          false,
          `No voice command heard — hold ${pttConfig.label} clearly while speaking.`
        );
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
    [issueClearance, pttConfig.label, selectAircraft, showToast]
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
            showToast(
              false,
              `No voice command heard — hold ${pttConfig.label} clearly while speaking.`
            );
          }
        }
      }, 300);
    }
  }, [executeTranscript, listening, pttConfig.label, showToast]);

  // Global key listener with e.preventDefault() to prevent volume/browser shortcuts
  useEffect(() => {
    const isMatchingKey = (e: KeyboardEvent): boolean => {
      if (pttConfig.key === " " && (e.key === " " || e.code === "Space")) {
        return true;
      }
      if (e.key.toLowerCase() === pttConfig.key.toLowerCase()) {
        return true;
      }
      if (e.code.toLowerCase() === pttConfig.key.toLowerCase()) {
        return true;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // If user is recording a custom key in the menu
      if (isRecordingCustomKey) {
        e.preventDefault();
        e.stopPropagation();
        const customKey = e.key === " " ? " " : e.key;
        const customLabel =
          e.key === " "
            ? "SPACE"
            : e.key.length === 1
            ? e.key.toUpperCase()
            : e.code.replace(/^(Key|Digit)/, "").toUpperCase();
        selectPttKey({ key: customKey, label: customLabel });
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (isMatchingKey(e) && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        startPtt();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isRecordingCustomKey) return;
      if (isMatchingKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        stopPtt();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [isRecordingCustomKey, pttConfig, selectPttKey, startPtt, stopPtt]);

  const activeCallsign = sim.selectedAircraftId
    ? sim.aircraft[sim.selectedAircraftId]?.callsign
    : null;

  return (
    <div className="relative flex items-center shrink-0" ref={menuRef}>
      <div className="inline-flex items-stretch rounded-md border shadow-sm border-[var(--atc-border)] bg-[var(--atc-surface)]">
        {/* Main Hold-to-Talk PTT button */}
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
              ? `Hold to transmit ATC Voice Command [Hold Key: ${pttConfig.label}]${
                  activeCallsign ? ` · Target: ${activeCallsign}` : ""
                }`
              : "Browser SpeechRecognition unavailable (use typed phrase box in VHF Radio menu)"
          }
          aria-pressed={listening}
          className={`px-2 py-1.5 rounded-l text-[11px] font-mono font-bold flex items-center gap-1 whitespace-nowrap transition-colors ${
            listening
              ? "bg-red-600 border-r border-red-500 text-white animate-pulse"
              : supported
              ? "hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text)]"
              : "bg-[var(--atc-surface-alt)] text-[var(--atc-muted)]"
          }`}
        >
          {supported ? (
            <Mic className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <MicOff className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="hidden sm:inline">
            {listening ? "TX LIVE" : `PTT [${pttConfig.label}]`}
          </span>
        </button>

        {/* Hotkey configuration dropdown trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowKeyMenu((s) => !s);
            setIsRecordingCustomKey(false);
          }}
          title={`Configure PTT Hotkey (currently [${pttConfig.label}])`}
          className="px-1 py-1.5 border-l border-[var(--atc-border)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] hover:text-[var(--atc-text)] transition-colors flex items-center justify-center rounded-r"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* PTT Keybinding selection menu */}
      {showKeyMenu && (
        <div className="absolute right-0 top-full mt-2 w-72 z-50 p-2.5 rounded-lg border-2 shadow-2xl text-[12px] font-mono select-none bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-text)] shadow-black/40">
          <div className="flex items-center gap-1.5 pb-2 border-b border-[var(--atc-border)] font-bold text-[11px] text-[var(--atc-text)]">
            <Keyboard className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>PUSH-TO-TALK (PTT) HOTKEY</span>
          </div>

          <div className="mt-2 text-[10px] leading-snug text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-1.5">
            <strong>Volume bar appearing?</strong> On some keyboards/laptops, &apos;V&apos; acts as volume control when Fn-Lock is on. Switch to <strong>SPACEBAR</strong> (aviation standard) below to fix this!
          </div>

          <div className="mt-2 space-y-1">
            {PTT_PRESETS.map((preset) => {
              const isSelected = pttConfig.key === preset.key;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => selectPttKey({ key: preset.key, label: preset.label })}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] text-left transition-colors ${
                    isSelected
                      ? "bg-blue-600 text-white font-bold"
                      : "hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-black/20 border border-white/10 text-[10px] font-mono font-bold">
                      [{preset.label}]
                    </span>
                    <span className="text-[10px] truncate">{preset.desc}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-[var(--atc-border)]">
            <button
              type="button"
              onClick={() => setIsRecordingCustomKey(true)}
              className={`w-full py-1.5 px-2 rounded text-[11px] border font-bold text-center transition-colors ${
                isRecordingCustomKey
                  ? "bg-amber-600 text-white border-amber-500 animate-pulse"
                  : "bg-[var(--atc-surface-alt)] border-[var(--atc-border)] hover:border-blue-500 text-[var(--atc-text)]"
              }`}
            >
              {isRecordingCustomKey
                ? "Press any key on keyboard now..."
                : "Bind Custom Key..."}
            </button>
          </div>
        </div>
      )}

      {/* Voice Transmission HUD & Clearance Notification Toasts */}
      {(listening || toast) && (
        <div
          onClick={() => {
            if (!listening && toast) setToast(null);
          }}
          title={!listening ? "Click to dismiss" : undefined}
          className={`absolute right-0 top-full mt-2 w-80 z-50 p-2.5 rounded-lg border-2 shadow-2xl text-[12px] font-mono select-none ${
            !listening && toast ? "cursor-pointer transition-opacity hover:opacity-90" : ""
          } ${
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
                <span>MIC LIVE · TRANSMITTING (HOLD [{pttConfig.label}])</span>
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
