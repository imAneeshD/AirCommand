import React from "react";
import { Award, CheckCircle2, Globe2, ShieldAlert, X } from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { ControllerRole } from "../types/atc.ts";

export const PostSessionModal: React.FC = () => {
  const report = useAtcStore((s) => s.postSessionReport);
  const clearPostSessionReport = useAtcStore((s) => s.clearPostSessionReport);
  const leaveMultiplayerRoom = useAtcStore((s) => s.leaveMultiplayerRoom);

  if (!report) return null;

  const totalConflicts = report.incursions + report.separationViolations;
  const rolesList = (["GROUND", "TOWER", "DEPARTURE"] as ControllerRole[]).map(
    (role) => report.roleScores[role]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-xl border border-[var(--atc-border)] bg-[var(--atc-panel)] text-[var(--atc-text)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--atc-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-[var(--atc-accent)]" />
            <div>
              <h2 className="font-bold text-base">
                Session Performance Report · Room {report.roomCode} ({report.airportIcao})
              </h2>
              <p className="text-xs text-[var(--atc-muted)]">
                Scenario: {report.scenarioId} ({report.difficulty}) · Duration:{" "}
                {Math.round(report.durationSeconds)}s
              </p>
            </div>
          </div>
          <button
            onClick={clearPostSessionReport}
            className="p-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Team Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="p-3 rounded-lg border border-[var(--atc-accent-border)] bg-[var(--atc-accent-soft)]">
              <div className="text-[10px] uppercase text-[var(--atc-muted)]">Team Score</div>
              <div className="font-mono text-xl font-extrabold text-[var(--atc-accent-text)]">
                {report.teamScore}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)]">
              <div className="text-[10px] uppercase text-[var(--atc-muted)]">Safety Score</div>
              <div className="font-mono text-xl font-extrabold text-[var(--atc-emerald)]">
                {report.safetyScore}%
              </div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] uppercase text-[var(--atc-muted)]">Departures</div>
              <div className="font-mono text-xl font-bold">{report.departuresCompleted}</div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] uppercase text-[var(--atc-muted)]">Arrivals</div>
              <div className="font-mono text-xl font-bold">{report.arrivalsCompleted}</div>
            </div>
            <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] uppercase text-[var(--atc-muted)]">Conflicts</div>
              <div className="font-mono text-xl font-bold flex items-center gap-1">
                {totalConflicts > 0 && <ShieldAlert className="w-4 h-4 text-[var(--atc-red)]" />}
                {totalConflicts}
              </div>
            </div>
          </div>

          {/* Per-Role Breakdown */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--atc-muted)]">
              Controller Role Evaluation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {rolesList.map((r) => (
                <div
                  key={r.role}
                  className="p-3.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">{r.role}</span>
                    <span className="font-mono font-bold text-[var(--atc-cyan)]">{r.score} pts</span>
                  </div>
                  <div className="text-[11px] text-[var(--atc-muted)] truncate">
                    {r.playerName ?? "AI Autonomous"}
                  </div>
                  <div className="space-y-1 pt-2 border-t border-[var(--atc-border)] font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--atc-muted)]">Accurate / Issued:</span>
                      <span>
                        {r.accurateClearances} / {r.clearancesIssued}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--atc-muted)]">Handoffs (OK / Missed):</span>
                      <span>
                        {r.handoffsCompleted} / {r.handoffsMissed}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--atc-muted)]">Avg Response:</span>
                      <span>{r.avgResponseTimeSec.toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--atc-muted)]">Penalties:</span>
                      <span className={r.penalties > 0 ? "text-[var(--atc-red)]" : ""}>
                        {r.penalties}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-end gap-2">
          <button
            onClick={clearPostSessionReport}
            className="px-3.5 py-1.5 text-xs font-semibold rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--atc-emerald)]" />
            Stay in Lobby
          </button>
          <button
            onClick={() => {
              clearPostSessionReport();
              leaveMultiplayerRoom();
            }}
            className="px-4 py-1.5 text-xs font-bold rounded bg-[var(--atc-accent)] text-stone-950 inline-flex items-center gap-1.5"
          >
            <Globe2 className="w-3.5 h-3.5" />
            Exit to Global Map
          </button>
        </div>
      </div>
    </div>
  );
};
