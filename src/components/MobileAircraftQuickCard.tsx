import React from "react";
import { ArrowRight, Check, Play, Radio, Zap, X } from "lucide-react";
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

      {/* Emergency Active Banner */}
      {aircraft.operationMode === "EMERGENCY_OPERATION" && aircraft.emergencyType !== "NONE" && (
        <div className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 font-bold text-[10px] flex items-center justify-between animate-pulse">
          <span className="flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="truncate">MAYDAY: {aircraft.emergencyType.replace(/_/g, " ")}</span>
          </span>
          <span className="font-mono text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded shrink-0">7700</span>
        </div>
      )}

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

        {/* Single Predicted 1-Click Action Button */}
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

        {/* When Ground controller finishes taxi and plane is holding short ready for Tower handover */}
        {aircraft.controller === "GROUND" &&
          (aircraft.state === "HOLDING_SHORT" ||
            aircraft.holdingAtRunway ||
            (aircraft.state === "HOLD_POSITION" &&
              aircraft.routeStepIndex >= (aircraft.assignedRouteNodeIds?.length ?? 1) - 1)) && (
            <button
              onClick={() => {
                issueClearance({
                  aircraftId: aircraft.id,
                  controller: "GROUND",
                  type: "HANDOFF",
                  parameters: { targetController: "TOWER" },
                });
              }}
              className="py-2 px-3 rounded-lg border border-sky-500/50 bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Radio className="w-3 h-3" />
              <span>CONTACT TWR</span>
            </button>
          )}

        {/* When under Tower control holding short -> Takeoff */}
        {aircraft.controller === "TOWER" &&
          (aircraft.state === "HOLDING_SHORT" ||
            aircraft.holdingAtRunway ||
            aircraft.state === "LINE_UP_WAIT") && (
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

        {/* When airborne on departure climb -> Contact Departure */}
        {aircraft.flightKind === "DEPARTURE" &&
          aircraft.controller === "TOWER" &&
          (aircraft.state === "CLIMB" || aircraft.altitude > sim.airport.elevationFt + 500) && (
            <button
              onClick={() => {
                issueClearance({
                  aircraftId: aircraft.id,
                  controller: "TOWER",
                  type: "HANDOFF",
                  parameters: { targetController: "DEPARTURE" },
                });
              }}
              className="py-2 px-3 rounded-lg border border-sky-500/50 bg-sky-500/20 text-sky-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Radio className="w-3 h-3" />
              <span>CONTACT DEP</span>
            </button>
          )}

        {/* When on Approach / Final -> Land */}
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

        {/* When landed and rollout on runway -> Vacate Runway */}
        {(aircraft.state === "ROLLOUT" || aircraft.state === "TOUCHDOWN") && (
          <button
            onClick={() => {
              issueClearance({
                aircraftId: aircraft.id,
                controller: "TOWER",
                type: "VACATE_RUNWAY",
              });
            }}
            className="py-2 px-3 rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center gap-1 cursor-pointer"
          >
            <ArrowRight className="w-3 h-3" />
            <span>VACATE</span>
          </button>
        )}

        {/* When vacated clear of active runway -> Contact Ground */}
        {(aircraft.state === "VACATING_RUNWAY" ||
          (aircraft.flightKind === "ARRIVAL" &&
            aircraft.controller === "TOWER" &&
            aircraft.state === "HOLD_POSITION")) && (
          <button
            onClick={() => {
              issueClearance({
                aircraftId: aircraft.id,
                controller: "TOWER",
                type: "HANDOFF",
                parameters: { targetController: "GROUND" },
              });
            }}
            className="py-2 px-3 rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Radio className="w-3 h-3" />
            <span>CONTACT GND</span>
          </button>
        )}
      </div>
    </div>
  );
};
