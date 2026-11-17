import React from "react";
import { ArrowRight, Check, Play, Zap, X } from "lucide-react";
import type { Aircraft } from "../types/atc.ts";
import { useAtcStore } from "../store/atcStore.ts";
import { formatAltitudeReadout } from "../utils/telemetry.ts";

interface MobileAircraftQuickCardProps {
  aircraft: Aircraft;
  onOpenClearances: () => void;
  onDeselect: () => void;
}

export const MobileAircraftQuickCard: React.FC<MobileAircraftQuickCardProps> = ({
  aircraft,
  onOpenClearances,
  onDeselect,
}) => {
  const sim = useAtcStore((s) => s.sim);
  const issueClearance = useAtcStore((s) => s.issueClearance);

  const altInfo = formatAltitudeReadout(aircraft, sim.airport.elevationFt);
  const isEmergency = aircraft.hasReadbackError || aircraft.operationMode === "EMERGENCY_OPERATION";

  return (
    <div className="absolute bottom-[66px] inset-x-2.5 z-20 rounded-2xl border border-[var(--atc-border-strong)] bg-[var(--atc-surface)]/95 backdrop-blur-xl shadow-2xl p-3 space-y-2 font-mono text-xs animate-in slide-in-from-bottom-2 duration-150 select-none">
      {/* Top row: Identity & Phase */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="font-extrabold text-sm text-[var(--atc-text)]">
            {aircraft.callsign}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-text-secondary)]">
            {aircraft.aircraftType}
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
              aircraft.flightKind === "DEPARTURE"
                ? "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)]"
                : "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)]"
            }`}
          >
            {aircraft.flightKind === "DEPARTURE" ? `DEP to ${aircraft.destinationIcao ?? "DEST"}` : "ARR"}
          </span>
        </div>

        <button
          onClick={onDeselect}
          className="p-1 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] cursor-pointer"
          title="Deselect aircraft"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* State & Telemetry line */}
      <div className="flex items-center justify-between text-[11px] text-[var(--atc-muted)]">
        <span className="flex items-center gap-1">
          <span
            className={`w-2 h-2 rounded-full ${
              isEmergency ? "bg-red-500 animate-pulse" : "bg-[var(--atc-cyan)]"
            }`}
          />
          <span className="font-semibold text-[var(--atc-text)]">
            {aircraft.state.replace(/_/g, " ")}
          </span>
        </span>
        <span>
          {altInfo.compact} • {Math.round(aircraft.speed)} kt • {aircraft.assignedApproach ?? aircraft.targetRunway ?? "RWY"}
        </span>
      </div>

      {/* Action Buttons: Full Clearances button + Quick action shortcut */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          onClick={onOpenClearances}
          className="flex-1 py-2 px-3 rounded-lg bg-[var(--atc-accent)] hover:opacity-90 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>OPEN CLEARANCES</span>
        </button>

        {aircraft.state === "AT_GATE" && (
          <button
            onClick={() => {
              issueClearance({
                aircraftId: aircraft.id,
                controller: "GROUND",
                type: "PUSHBACK",
                parameters: { targetRunway: aircraft.targetRunway },
              });
            }}
            className="py-2 px-3 rounded-lg border border-[var(--atc-accent-border)] bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] font-bold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Play className="w-3 h-3" />
            <span>PUSH</span>
          </button>
        )}

        {(aircraft.state === "HOLDING_SHORT" || aircraft.holdingAtRunway) && (
          <button
            onClick={() => {
              issueClearance({
                aircraftId: aircraft.id,
                controller: "TOWER",
                type: "TAKEOFF",
                parameters: { runway: (aircraft.holdingAtRunway ?? aircraft.targetRunway)! },
              });
            }}
            className="py-2 px-3 rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1 cursor-pointer"
          >
            <ArrowRight className="w-3 h-3" />
            <span>TAKEOFF</span>
          </button>
        )}

        {(aircraft.state === "FINAL" || aircraft.state === "APPROACH") && (
          <button
            onClick={() => {
              issueClearance({
                aircraftId: aircraft.id,
                controller: "TOWER",
                type: "LAND",
                parameters: { runway: aircraft.assignedApproach ?? aircraft.targetRunway ?? "09L" },
              });
            }}
            className="py-2 px-3 rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center gap-1 cursor-pointer"
          >
            <Check className="w-3 h-3" />
            <span>LAND</span>
          </button>
        )}
      </div>
    </div>
  );
};
