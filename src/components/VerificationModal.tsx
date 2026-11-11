import React, { useMemo, useState } from "react";
import { CheckCircle2, Play, ShieldCheck, X, XCircle } from "lucide-react";
import {
  runMandatoryVerificationSuite,
  type VerificationTestResult,
} from "../engine/verificationSuite.ts";
import { useAtcStore } from "../store/atcStore.ts";

export const VerificationModal: React.FC = () => {
  const show = useAtcStore((s) => s.showVerificationModal);
  const setShow = useAtcStore((s) => s.setShowVerificationModal);
  const [runCounter, setRunCounter] = useState(0);

  const results: VerificationTestResult[] = useMemo(() => {
    if (!show) return [];
    void runCounter;
    return runMandatoryVerificationSuite();
  }, [show, runCounter]);

  if (!show) return null;

  const passedCount = results.filter((r) => r.passed).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded-xl shadow-2xl flex flex-col overflow-hidden text-[var(--atc-text)]">
        <div className="px-4 py-3 border-b border-[var(--atc-border)] bg-[var(--atc-panel)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--atc-emerald)]" />
            <div>
              <h2 className="text-sm font-bold text-[var(--atc-text)] font-mono">
                MANDATORY ATC CLEARANCE & MOVEMENT VERIFICATION SUITE
              </h2>
              <p className="text-[11px] text-[var(--atc-muted)] font-mono">
                Live execution against the simulation engine ({passedCount}/{results.length} Passed)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunCounter((c) => c + 1)}
              className="px-2.5 py-1 rounded-md bg-[var(--atc-accent-bg)] hover:opacity-90 border border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] text-xs font-mono font-semibold flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Re-Run Suite
            </button>
            <button
              onClick={() => setShow(false)}
              className="p-1 rounded-md hover:bg-[var(--atc-surface-alt)] text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--atc-bg)]/40">
          {results.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-2.5 flex items-start gap-2.5 bg-[var(--atc-surface)] ${
                r.passed
                  ? "border-[var(--atc-emerald-border)]"
                  : "border-[var(--atc-red-border)]"
              }`}
            >
              {r.passed ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--atc-emerald)] shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-[var(--atc-red)] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-mono font-bold text-[var(--atc-text)]">
                  {r.name}
                </div>
                <div className="text-[11px] font-mono text-[var(--atc-text-secondary)] mt-0.5">
                  {r.details}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
