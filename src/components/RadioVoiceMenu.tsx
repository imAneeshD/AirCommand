import React, { useEffect, useState } from "react";
import { BookOpen, ChevronDown, Mic, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import { ICAO_PHONETIC_TABLE } from "../utils/natoPhonetics.ts";
import { radioAudio, type RankedVoice } from "../utils/radioAudio.ts";
import { parseAtcVoiceCommand } from "../utils/voiceCommandParser.ts";
import { Accordion } from "./Accordion.tsx";

export const RadioVoiceMenu: React.FC = () => {
  const sim = useAtcStore((s) => s.sim);
  const voiceEnabled = useAtcStore((s) => s.voiceEnabled);
  const toggleVoice = useAtcStore((s) => s.toggleVoice);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const issueClearance = useAtcStore((s) => s.issueClearance);

  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<RankedVoice[]>(() => radioAudio.getAvailableVoices());
  const [ctrlVoice, setCtrlVoice] = useState(radioAudio.preferredControllerVoiceURI);
  const [pilotVoice, setPilotVoice] = useState(radioAudio.preferredPilotVoiceURI);
  const [staticLevel, setStaticLevel] = useState(radioAudio.radioStaticLevel);
  const [pilotRate, setPilotRate] = useState(radioAudio.pilotRateBase);
  const [rogerBeep, setRogerBeep] = useState(radioAudio.rogerBeepEnabled);
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseStatus, setPhraseStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsub = radioAudio.subscribe(() => {
      setVoices([...radioAudio.getAvailableVoices()]);
    });
    setVoices([...radioAudio.getAvailableVoices()]);
    return unsub;
  }, []);

  const activeCtrl = radioAudio.getEffectiveControllerVoice();
  const hasOnlyLocalVoices =
    voices.length > 0 && voices.every((v) => v.quality === "LOCAL");

  return (
    <div className="relative flex items-center shrink-0">
      <div
        className={`flex items-center rounded-md border overflow-hidden shadow-sm transition-colors ${
          voiceEnabled
            ? "border-[var(--atc-border)] bg-[var(--atc-surface)]"
            : "border-[var(--atc-red-border)] bg-[var(--atc-red-bg)]"
        }`}
      >
        <button
          onClick={toggleVoice}
          aria-pressed={!voiceEnabled}
          title={
            voiceEnabled
              ? "Voice Output ON — click to mute ATC & Pilot speech [Key: M]"
              : "Voice Output MUTED — click to unmute ATC & Pilot speech [Key: M]"
          }
          className={`px-2 py-1.5 text-[11px] font-mono flex items-center gap-1 whitespace-nowrap transition-colors ${
            voiceEnabled
              ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] font-bold"
              : "text-[var(--atc-red)] font-bold hover:opacity-85"
          }`}
        >
          {voiceEnabled ? (
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="hidden sm:inline">{voiceEnabled ? "VOICE" : "MUTED"}</span>
        </button>
        <button
          onClick={() => {
            setVoices([...radioAudio.getAvailableVoices()]);
            setOpen((v) => !v);
          }}
          title="Radio Voice & VHF Static Settings"
          className={`px-1.5 py-1.5 border-l text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] ${
            voiceEnabled ? "border-[var(--atc-border)]" : "border-[var(--atc-red-border)]"
          }`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-2xl p-3 space-y-2.5 text-xs font-mono text-[var(--atc-text)]">
          <div className="flex items-center justify-between border-b border-[var(--atc-border)] pb-2">
            <div className="flex items-center gap-1.5 text-[var(--atc-text)] font-bold">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--atc-accent)]" />
              VHF RADIO & VOICE
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--atc-muted)] hover:text-[var(--atc-text)] text-[11px]"
            >
              CLOSE
            </button>
          </div>

          <button
            onClick={toggleVoice}
            className={`w-full px-2.5 py-2 rounded-md border text-[11px] flex items-center justify-between transition-colors ${
              voiceEnabled
                ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                : "bg-[var(--atc-red-bg)] border-[var(--atc-red-border)] text-[var(--atc-red)]"
            }`}
          >
            <span className="flex items-center gap-1.5 font-bold">
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              Voice Output (ATC & Pilots)
            </span>
            <span className="font-extrabold">
              {voiceEnabled ? "ON (MUTE)" : "MUTED (OFF)"}
            </span>
          </button>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--atc-muted)] block">
              CONTROLLER VOICE ({activeCtrl ? activeCtrl.quality : "NONE"})
            </label>
            <select
              value={ctrlVoice}
              onChange={(e) => {
                radioAudio.preferredControllerVoiceURI = e.target.value;
                setCtrlVoice(e.target.value);
              }}
              className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded px-2 py-1.5 text-[11px] text-[var(--atc-text)]"
            >
              <option value="AUTO">Auto-Select Best ATC Voice</option>
              {voices.map((v) => (
                <option key={v.voice.voiceURI} value={v.voice.voiceURI}>
                  [{v.quality}] {v.voice.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--atc-muted)] block">PILOT VOICES</label>
            <select
              value={pilotVoice}
              onChange={(e) => {
                radioAudio.preferredPilotVoiceURI = e.target.value;
                setPilotVoice(e.target.value);
              }}
              className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded px-2 py-1.5 text-[11px] text-[var(--atc-text)]"
            >
              <option value="AUTO">Auto-Rotate Distinct Pilot Voices</option>
              {voices.map((v) => (
                <option key={v.voice.voiceURI} value={v.voice.voiceURI}>
                  [{v.quality}] {v.voice.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-[var(--atc-muted)]">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> VHF STATIC & SQUELCH
              </span>
              <span className="text-[var(--atc-text)] font-bold">
                {Math.round(staticLevel * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={staticLevel}
              onChange={(e) => {
                const val = Number(e.target.value);
                radioAudio.radioStaticLevel = val;
                setStaticLevel(val);
              }}
              className="w-full accent-amber-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-[var(--atc-muted)]">
              <span>PILOT CADENCE (RATE)</span>
              <span className="text-[var(--atc-text)] font-bold">
                {pilotRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.95}
              max={1.3}
              step={0.05}
              value={pilotRate}
              onChange={(e) => {
                const val = Number(e.target.value);
                radioAudio.pilotRateBase = val;
                setPilotRate(val);
              }}
              className="w-full accent-cyan-500"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !rogerBeep;
              radioAudio.rogerBeepEnabled = next;
              setRogerBeep(next);
            }}
            className="w-full px-2.5 py-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[10px] flex items-center justify-between"
          >
            <span className="text-[var(--atc-muted)]">VHF ROGER BEEP & SQUELCH TAIL</span>
            <span className={`font-bold ${rogerBeep ? "text-[var(--atc-emerald)]" : "text-[var(--atc-muted)]"}`}>
              {rogerBeep ? "ON" : "OFF"}
            </span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parseAtcVoiceCommand(phraseInput, useAtcStore.getState().sim);
              if (!parsed.ok) {
                setPhraseStatus(parsed.reason);
                return;
              }
              selectAircraft(parsed.aircraftId);
              issueClearance(parsed.command);
              setPhraseStatus(`Sent: ${parsed.summary}`);
              setPhraseInput("");
            }}
            className="space-y-1 pt-1 border-t border-[var(--atc-border)]"
          >
            <label className="text-[10px] text-[var(--atc-muted)] block">
              VOICE / PHRASE COMMAND (HOLD [V] FOR MIC PTT)
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder='e.g. "Delta 437 climb 5000"'
                className="flex-1 min-w-0 bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded px-2 py-1 text-[11px] text-[var(--atc-text)] placeholder:text-[var(--atc-muted)]"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] font-bold text-[10px]"
              >
                TX
              </button>
            </div>
            {phraseStatus && (
              <div className="text-[10px] text-[var(--atc-text-secondary)] truncate">
                {phraseStatus}
              </div>
            )}
          </form>

          <div className="px-2.5 py-1.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[10px] flex items-center justify-between">
            <span className="text-[var(--atc-muted)]">ACTIVE FREQ:</span>
            <span className="text-[var(--atc-cyan)] font-bold">
              {sim.config.activePlayerStation === "ALL"
                ? "ALL (G + T + D)"
                : `${sim.config.activePlayerStation} ONLY`}
            </span>
          </div>

          {hasOnlyLocalVoices && (
            <div className="p-2 rounded bg-[var(--atc-amber-bg)] border border-[var(--atc-amber-border)] text-[10px] text-[var(--atc-amber)] leading-relaxed">
              Only offline OS voices detected ({voices[0]?.voice.name}). Edge/Chrome neural voices give even sharper ATC timbre.
            </div>
          )}

          <button
            onClick={() => {
              if (!radioAudio.voiceEnabled) toggleVoice();
              radioAudio.stopAllSpeech();
              radioAudio.speakRadio(
                "United 452, Asteria Tower, taxi via Alpha, runway 09L cleared for takeoff, direct ASTER1.",
                "CONTROLLER",
                "TOWER",
                true
              );
              radioAudio.speakRadio(
                "Cleared for takeoff runway 09L, direct ASTER1, United 452.",
                "PILOT",
                "UAL452",
                true
              );
            }}
            className="w-full py-1.5 rounded-md bg-[var(--atc-accent-bg)] hover:opacity-90 border border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold flex items-center justify-center gap-1.5"
          >
            <Mic className="w-3.5 h-3.5" />
            TEST ATC RADIO VOICE
          </button>

          <Accordion
            title="ICAO Phonetic Alphabet (A–Z)"
            icon={<BookOpen className="w-3 h-3" />}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 max-h-36 overflow-y-auto text-[10px]">
              {ICAO_PHONETIC_TABLE.map((entry) => (
                <div key={entry.letter} className="flex items-center justify-between">
                  <span className="text-[var(--atc-cyan)] font-bold">{entry.letter}</span>
                  <span className="text-[var(--atc-text)]">{entry.icao}</span>
                </div>
              ))}
            </div>
          </Accordion>
        </div>
      )}
    </div>
  );
};
