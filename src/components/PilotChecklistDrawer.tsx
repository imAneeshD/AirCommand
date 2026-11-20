import React from "react";
import { CheckCircle2, Circle, X, CheckSquare, ListChecks, ShieldCheck } from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { PilotChecklistItem } from "../types/pilot.ts";

interface PilotChecklistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PHASE_LABELS: Record<PilotChecklistItem["phase"], string> = {
  COCKPIT_PREP: "1. Cockpit Preparation",
  BEFORE_PUSHBACK: "2. Before Pushback & Start",
  TAXI: "3. Taxi Checklist",
  BEFORE_TAKEOFF: "4. Before Takeoff",
};

export function PilotChecklistDrawer({ isOpen, onClose }: PilotChecklistDrawerProps) {
  const checklist = useAtcStore((s) => s.cockpitChecklist);
  const toggleChecklistItem = useAtcStore((s) => s.toggleChecklistItem);

  if (!isOpen) return null;

  const completedCount = checklist.filter((item) => item.completed).length;
  const totalCount = checklist.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  const phases: Array<PilotChecklistItem["phase"]> = [
    "COCKPIT_PREP",
    "BEFORE_PUSHBACK",
    "TAXI",
    "BEFORE_TAKEOFF",
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--atc-panel)] border-l border-[var(--atc-border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[var(--atc-border)] flex items-center justify-between bg-[var(--atc-surface)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] flex items-center justify-center text-[var(--atc-emerald)]">
            <ListChecks className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-black font-mono uppercase tracking-wider text-[var(--atc-text)]">
              ELECTRONIC CHECKLIST (ECL)
            </h2>
            <p className="text-[10px] text-[var(--atc-muted)] font-mono">
              Standard Operating Procedures (SOP) · Hotkey [C]
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] hover:text-[var(--atc-text)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-5 py-3 border-b border-[var(--atc-border)] bg-[var(--atc-panel)] flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
            <span className="text-[var(--atc-muted)]">Checklist Verified:</span>
            <span className="font-bold text-[var(--atc-emerald)]">
              {completedCount} / {totalCount} ({progressPct}%)
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--atc-surface-alt)] overflow-hidden">
            <div
              className="h-full bg-[var(--atc-emerald)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Checklist Items Grouped by Phase */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 select-none font-mono">
        {phases.map((phase) => {
          const items = checklist.filter((it) => it.phase === phase);
          const phaseComplete = items.every((it) => it.completed);

          return (
            <div key={phase} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--atc-muted)] uppercase border-b border-[var(--atc-border)] pb-1">
                <span>{PHASE_LABELS[phase]}</span>
                {phaseComplete && (
                  <span className="text-[10px] text-[var(--atc-emerald)] flex items-center gap-1 font-extrabold">
                    <ShieldCheck className="w-3 h-3" /> VERIFIED
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {items.map((item) => {
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleChecklistItem(item.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        item.completed
                          ? "border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)]/30 text-[var(--atc-text)]"
                          : "border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--atc-emerald)] shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-[var(--atc-muted)] shrink-0" />
                        )}
                        <span className={`text-xs ${item.completed ? "font-bold text-[var(--atc-text)]" : ""}`}>
                          {item.title}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          item.completed
                            ? "bg-[var(--atc-emerald)] text-black border-[var(--atc-emerald-border)]"
                            : "bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] border-[var(--atc-border)]"
                        }`}
                      >
                        {item.actionRequired}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[var(--atc-border)] bg-[var(--atc-surface)] text-[10px] font-mono text-[var(--atc-muted)] text-center">
        Switches in the cockpit automatically advance checklist items when configured.
      </div>
    </div>
  );
}
