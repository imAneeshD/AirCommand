import React from "react";
import {
  FileText,
  X,
  Plane,
  CheckCircle,
  Clock,
  Radio,
  ArrowRight,
  Compass,
  AlertCircle,
  UserCheck,
} from "lucide-react";
import type { Aircraft } from "../types/atc.ts";
import { useAtcStore } from "../store/atcStore.ts";

interface IfrFlightPlanModalProps {
  aircraft: Aircraft | null;
  onClose: () => void;
}

export const IfrFlightPlanModal: React.FC<IfrFlightPlanModalProps> = ({
  aircraft,
  onClose,
}) => {
  const issueClearance = useAtcStore((s) => s.issueClearance);
  const sim = useAtcStore((s) => s.sim);

  if (!aircraft) return null;

  const fp = aircraft.flightPlan;
  const isCleared = fp ? fp.clearanceStatus === "CLEARED" : aircraft.flightKind === "ARRIVAL";
  const activeStation = sim.config.activePlayerStation;
  const canIssueDelivery = activeStation === "ALL" || activeStation === "DELIVERY";

  const handleIssueClearance = () => {
    issueClearance({
      aircraftId: aircraft.id,
      controller: "DELIVERY",
      type: "IFR_CLEARANCE",
      parameters: { altitude: 5000 },
    });
  };

  const handleTransferToGround = () => {
    issueClearance({
      aircraftId: aircraft.id,
      controller: "DELIVERY",
      type: "HANDOFF",
      parameters: { targetController: "GROUND" },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--atc-border-strong)] bg-[var(--atc-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--atc-accent-soft)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-[var(--atc-text)]">
                  FLIGHT PLAN · {aircraft.callsign}
                </span>
                <span
                  className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded border ${
                    isCleared
                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/80"
                      : "bg-amber-950/80 text-amber-400 border-amber-700/80 animate-pulse"
                  }`}
                >
                  {isCleared ? "CLEARED" : "PENDING"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--atc-muted)] font-mono">
                ICAO / FAA Standard IFR Flight Progress Record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Flight Plan"
            className="p-1 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto text-xs font-mono">
          {/* Visual Header Summary Pill */}
          <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-center text-[var(--atc-cyan)]">
                <Plane className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-[var(--atc-text)]">
                  {aircraft.callsign}
                </div>
                <div className="text-[11px] text-[var(--atc-muted)]">
                  {aircraft.aircraftType}{fp?.equipmentSuffix ?? "/L"} · TAS {fp?.tasKt ?? 440} kt
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[var(--atc-muted)]">PROPOSED DEP</div>
              <div className="text-xs font-bold text-[var(--atc-accent-text)]">
                {fp?.departureIcao ?? "DEP"} · {fp?.proposedDepartureTimeZ ?? "P2121"}
              </div>
            </div>
          </div>

          {/* Core Flight Plan Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Route Corridor */}
            <div className="col-span-2 p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider flex items-center gap-1 mb-1">
                <Compass className="w-3 h-3 text-[var(--atc-cyan)]" />
                Filed IFR Route Corridor
              </div>
              <div className="font-bold text-xs text-[var(--atc-text)] tracking-wide">
                {fp?.route ?? `${aircraft.originIcao ?? "ORIG"} … ${aircraft.destinationIcao ?? "DEST"}`}
              </div>
            </div>

            {/* Departure */}
            <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider mb-0.5">
                Departure
              </div>
              <div className="font-bold text-[var(--atc-text)]">
                {fp?.departureIcao ?? aircraft.originIcao ?? "ORIG"}
              </div>
              <div className="text-[10px] text-[var(--atc-muted)] truncate">
                {fp?.departureName ?? aircraft.originName ?? "Origin Airport"}
              </div>
            </div>

            {/* Destination */}
            <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider mb-0.5">
                Destination
              </div>
              <div className="font-bold text-[var(--atc-text)]">
                {fp?.destinationIcao ?? aircraft.destinationIcao ?? "DEST"}
              </div>
              <div className="text-[10px] text-[var(--atc-muted)] truncate">
                {fp?.destinationName ?? aircraft.destinationName ?? "Destination Airport"}
              </div>
            </div>

            {/* Requested Altitude */}
            <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider mb-0.5">
                Requested Altitude
              </div>
              <div className="font-bold text-[var(--atc-text)]">
                {fp?.requestedAltitude ?? "pending"}
              </div>
              <div className="text-[10px] text-[var(--atc-muted)]">
                Initial: {fp?.assignedAltitude ?? "5,000 ft (SID)"}
              </div>
            </div>

            {/* Assigned Beacon */}
            <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider mb-0.5">
                Assigned Beacon
              </div>
              <div className="font-bold text-[var(--atc-text)] flex items-center gap-1.5">
                {isCleared ? (
                  <>
                    <span className="text-emerald-400 font-extrabold">{fp?.assignedBeacon ?? aircraft.squawk}</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-400">
                      IDENT
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--atc-muted)]">— (pending clearance)</span>
                )}
              </div>
            </div>
          </div>

          {/* Crew Notes / Pilot Personality */}
          {fp?.crewNotes && (
            <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)]/80">
              <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider flex items-center gap-1 mb-1">
                <UserCheck className="w-3 h-3 text-[var(--atc-amber)]" />
                Flight Crew / Cockpit Observations
              </div>
              <p className="text-[11px] text-[var(--atc-text-secondary)] italic leading-relaxed">
                "{fp.crewNotes}"
              </p>
            </div>
          )}

          {/* Clearance Status Summary Box */}
          <div
            className={`p-3 rounded-lg border ${
              isCleared
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                : "bg-amber-950/40 border-amber-800/60 text-amber-300"
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
              {isCleared ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              )}
              {isCleared ? "IFR Clearance Issued & Acknowledged" : "Clearance Not Yet Issued"}
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              {isCleared
                ? `Cleared to ${fp?.destinationIcao ?? aircraft.destinationIcao} via ${fp?.sidFix ?? "SID"}, climb and maintain ${fp?.assignedAltitude ?? "5,000 ft"}, departure ${fp?.departureFrequency ?? "124.70"}, squawk ${fp?.assignedBeacon ?? aircraft.squawk}.`
                : "Aircraft is at gate awaiting IFR route clearance copy from Clearance Delivery controller."}
            </p>
          </div>
        </div>

        {/* Modal Action Deck */}
        <div className="px-4 py-3 border-t border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between gap-2 shrink-0">
          <div className="text-[10px] text-[var(--atc-muted)] font-mono">
            Controller Station: <strong className="text-[var(--atc-text)]">{aircraft.controller}</strong>
          </div>

          <div className="flex items-center gap-2">
            {!isCleared && canIssueDelivery && (
              <button
                type="button"
                onClick={handleIssueClearance}
                className="py-1.5 px-3 rounded-lg bg-[var(--atc-accent)] hover:brightness-105 text-stone-950 font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <Radio className="w-3.5 h-3.5" />
                Issue IFR Clearance (CRAFT)
              </button>
            )}

            {isCleared && aircraft.controller === "DELIVERY" && canIssueDelivery && (
              <button
                type="button"
                onClick={handleTransferToGround}
                className="py-1.5 px-3 rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] hover:bg-[var(--atc-emerald-border)] text-[var(--atc-emerald)] font-mono font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Contact Ground (121.90)
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="py-1.5 px-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)] font-mono text-xs cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
