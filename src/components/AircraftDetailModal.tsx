import React, { useEffect, useState } from "react";
import {
  Camera,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Fuel,
  Gauge,
  Info,
  Layers,
  MapPin,
  Plane,
  Radio,
  Shield,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { AircraftTypeSpec, AirlineLivery } from "../data/aircraftCatalog.ts";
import type { AircraftPhotoResponse } from "../services/apiClient.ts";
import type { Aircraft } from "../types/atc.ts";
import { getAircraftPhaseLabel } from "../engine/simulation.ts";
import { getAglAltitudeFt, isSurfaceAircraft } from "../utils/telemetry.ts";
import { AircraftSideProfile } from "./AircraftSideProfile.tsx";

export interface AircraftDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  aircraft?: Aircraft;
  spec: AircraftTypeSpec;
  livery: AirlineLivery;
  registration: string;
  elevationFt: number;
  photo?: AircraftPhotoResponse | null;
  theme: "light" | "dark";
}

export const AircraftDetailModal: React.FC<AircraftDetailModalProps> = ({
  isOpen,
  onClose,
  aircraft,
  spec,
  livery,
  registration,
  elevationFt,
  photo,
  theme,
}) => {
  const [viewMode, setViewMode] = useState<"PHOTO" | "BLUEPRINT">(
    photo?.found && photo.url ? "PHOTO" : "BLUEPRINT"
  );
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"SPECS" | "ROUTE" | "TELEMETRY">("SPECS");

  useEffect(() => {
    if (photo?.found && photo.url) {
      setViewMode("PHOTO");
    } else {
      setViewMode("BLUEPRINT");
    }
  }, [photo?.found, photo?.url]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const agl = aircraft ? getAglAltitudeFt(aircraft, elevationFt) : 0;
  const onGround = aircraft ? isSurfaceAircraft(aircraft, elevationFt) : true;
  const digits = (aircraft?.callsign || "").replace(/\D/g, "") || "100";
  const flightNumber = `${livery.iataCode} ${digits}`;
  const effectiveCallsign = aircraft?.callsign || registration || spec.code;
  const hasPhoto = Boolean(photo?.found && photo.url);

  const fallbackAircraft: Aircraft = aircraft ?? {
    id: registration || spec.code,
    callsign: registration || spec.code,
    spokenCallsign: spec.model,
    airline: livery.airlineName,
    aircraftType: spec.code,
    wakeCategory: "MEDIUM",
    flightKind: "ARRIVAL",
    squawk: "1200",
    state: "CRUISE_OUTBOUND",
    controller: "DEPARTURE",
    operationMode: "NORMAL_OPERATION",
    emergencyType: "NONE",
    commStatus: "NORMAL",
    nordoMode: "LIGHT_GUN_SIGNALS",
    x: 0,
    y: 0,
    heading: 90,
    altitude: elevationFt + 4000,
    speed: 250,
    verticalSpeed: 0,
    targetRunway: "09",
    assignedRouteNodeIds: [],
    assignedRouteTaxiways: [],
    routeStepIndex: 0,
    crossRunwayCleared: {},
    requiresPushback: false,
    assignedHeading: null,
    assignedTurnDirection: "NEAREST",
    assignedAltitude: null,
    assignedSpeed: null,
    assignedApproach: null,
    assignedDirectFix: null,
    clearances: [],
    pendingRequest: null,
    hasReadbackError: false,
    armNextReadbackError: false,
    spawnedAt: 0,
    stateEnteredAt: 0,
    lastTransmissionAt: 0,
    trail: [],
  };

  const handleCopySummary = () => {
    const summary = [
      `AIRCRAFT: ${spec.manufacturer} ${spec.model} (${spec.code})`,
      `CALLSIGN: ${effectiveCallsign} | REG: ${registration}`,
      `OPERATOR: ${livery.airlineName} (${livery.iataCode})`,
      `ENGINES: ${spec.engines}`,
      `WAKECAT: ${spec.bodyClass} · ${aircraft?.wakeCategory ?? "MEDIUM"}`,
      `ALTITUDE: ${aircraft ? Math.round(aircraft.altitude) : "N/A"} ft (${agl} ft AGL) | SPEED: ${
        aircraft ? Math.round(aircraft.speed) : spec.cruiseSpeed
      } kts`,
      `ROUTE: ${aircraft?.originIcao ?? "N/A"} -> ${aircraft?.destinationIcao ?? "N/A"}`,
      `STATUS: ${aircraft ? getAircraftPhaseLabel(aircraft) : "STATIC"} | SQUAWK: ${
        aircraft?.squawk ?? "N/A"
      }`,
    ].join("\n");

    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${spec.model} Aircraft Details`}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =====================================================================
            MODAL HEADER
            ===================================================================== */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--atc-border)] bg-[var(--atc-surface-alt)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Airline Livery Color Swatch */}
            <span
              className="w-3 h-8 rounded-sm shrink-0 border border-[var(--atc-border)] overflow-hidden flex flex-col shadow-sm"
              title={`${livery.airlineName} Livery`}
            >
              <span className="flex-1 w-full" style={{ backgroundColor: livery.tailBg }} />
              <span className="h-2.5 w-full" style={{ backgroundColor: livery.cheatline }} />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold font-mono text-sm sm:text-base text-[var(--atc-text)] tracking-tight">
                  {effectiveCallsign}
                </span>
                <span className="text-xs font-mono text-[var(--atc-muted)]">
                  ({flightNumber})
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[10px] font-mono font-bold text-[var(--atc-accent-text)]">
                  {spec.code}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[10px] font-mono font-bold text-[var(--atc-cyan)]">
                  {spec.bodyClass}
                </span>
              </div>
              <div className="text-xs text-[var(--atc-muted)] truncate flex items-center gap-2">
                <span>{livery.airlineName}</span>
                <span>•</span>
                <span>
                  Reg:{" "}
                  <strong className="font-mono text-[var(--atc-text)]">
                    {registration}
                  </strong>
                </span>
                {aircraft?.icao24 && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-[10px] text-[var(--atc-muted)] uppercase">
                      Hex: {aircraft.icao24}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySummary}
              title="Copy aircraft specs & telemetry to clipboard"
              className="p-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] transition-colors cursor-pointer text-xs font-mono flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="hidden sm:inline text-emerald-500 font-bold">COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">COPY DATA</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close modal (Esc)"
              className="p-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            LARGE HERO SHOWCASE VIEW (Real Photo vs High-Def Technical Blueprint)
            ===================================================================== */}
        <div className="relative w-full h-[210px] sm:h-[260px] bg-black shrink-0 overflow-hidden border-b border-[var(--atc-border)]">
          {viewMode === "PHOTO" && hasPhoto && photo?.url ? (
            /* High-Res Photograph */
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={photo.fullUrl || photo.url}
                alt={`${livery.airlineName} ${spec.model}`}
                className="w-full h-full object-contain object-center"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-white/95">
                <div className="flex items-center gap-1.5 truncate max-w-[80%]">
                  <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">
                    {photo.caption ?? `${spec.manufacturer} ${spec.model}`}
                    {photo.photographer && ` • Photo: ${photo.photographer}`}
                    {photo.source && ` (${photo.source})`}
                  </span>
                </div>
                {photo.source === "Planespotters.net" && (
                  <span className="shrink-0 text-[10px] text-sky-300 flex items-center gap-1">
                    Verified Registry <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* High-Res Technical CAD Blueprint Profile */
            <div className="relative w-full h-full">
              <AircraftSideProfile
                aircraft={fallbackAircraft}
                spec={spec}
                livery={livery}
                registration={registration}
                elevationFt={elevationFt}
                theme={theme}
                embedded
              />
            </div>
          )}

          {/* Mode Switcher Pill (PHOTO vs BLUEPRINT) */}
          <div className="absolute top-2 right-3 z-20 flex items-center gap-1 p-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/20 shadow-lg">
            {hasPhoto && (
              <button
                type="button"
                onClick={() => setViewMode("PHOTO")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "PHOTO"
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>REAL PHOTO</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode("BLUEPRINT")}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "BLUEPRINT"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>CAD BLUEPRINT</span>
            </button>
          </div>
        </div>

        {/* =====================================================================
            NAVIGATION TABS
            ===================================================================== */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-xs font-mono shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("SPECS")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "SPECS"
                ? "bg-[var(--atc-accent)] text-stone-950 shadow-sm"
                : "text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)]"
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>AIRFRAME & PERFORMANCE</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ROUTE")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "ROUTE"
                ? "bg-[var(--atc-accent)] text-stone-950 shadow-sm"
                : "text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)]"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>ROUTE & OPERATOR</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TELEMETRY")}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "TELEMETRY"
                ? "bg-[var(--atc-accent)] text-stone-950 shadow-sm"
                : "text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)]"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>RADAR & AVIONICS TELEMETRY</span>
          </button>
        </div>

        {/* =====================================================================
            TAB CONTENT PANELS (Scrollable)
            ===================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
          {/* TAB 1: AIRFRAME & PERFORMANCE SPECIFICATIONS */}
          {activeTab === "SPECS" && (
            <div className="space-y-4">
              {/* Header Box */}
              <div className="p-3 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] text-[var(--atc-muted)] uppercase tracking-wider font-semibold">
                    MANUFACTURER & MODEL
                  </div>
                  <div className="text-base font-extrabold text-[var(--atc-text)]">
                    {spec.manufacturer} {spec.model}
                  </div>
                  <div className="text-[11px] text-[var(--atc-text-secondary)]">
                    ICAO Code: <strong className="font-bold text-[var(--atc-accent-text)]">{spec.code}</strong> • Body Class: <strong>{spec.bodyClass}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] text-[var(--atc-cyan)] font-bold text-xs">
                    WAKE {aircraft?.wakeCategory ?? "MEDIUM"}
                  </span>
                  {spec.isCargoOnly && (
                    <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-500 font-bold text-xs">
                      FREIGHTER
                    </span>
                  )}
                </div>
              </div>

              {/* Technical Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">POWERPLANTS</span>
                  <span className="font-bold text-[var(--atc-text)] block truncate" title={spec.engines}>
                    {spec.engines}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">WINGSPAN</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.wingspan}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">FUSELAGE LENGTH</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.length}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">MAX TAKEOFF WEIGHT</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.mtow}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">CRUISE SPEED</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.cruiseSpeed}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">MAX RANGE</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.rangeNm}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">SERVICE CEILING</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.ceiling}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">CAPACITY / PAYLOAD</span>
                  <span className="font-bold text-[var(--atc-text)] block">
                    {spec.capacityPax}
                  </span>
                </div>
              </div>

              {/* Aeronautical Description & Airframe Notes */}
              <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-[11px] text-[var(--atc-text-secondary)] leading-relaxed">
                <strong className="text-[var(--atc-text)]">Engineering Profile:</strong> The {spec.model} is a {spec.bodyClass.toLowerCase()} aircraft powered by {spec.engines}. Designed with a certified ceiling of {spec.ceiling} and maximum operational range of {spec.rangeNm}, it is fully modeled in the simulation with accurate aerodynamic climb gradients, rollout deceleration, wake turbulence separation categories, and type-specific landing gear kinematics.
              </div>
            </div>
          )}

          {/* TAB 2: ROUTE & OPERATOR */}
          {activeTab === "ROUTE" && (
            <div className="space-y-4">
              {/* Origin -> Destination Banner */}
              <div className="p-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-[var(--atc-muted)] uppercase tracking-wider font-semibold">
                    ORIGIN AIRPORT
                  </div>
                  <div className="text-xl font-extrabold text-[var(--atc-text)]">
                    {aircraft?.originIcao ?? "VIDP"}
                  </div>
                  <div className="text-[11px] text-[var(--atc-text-secondary)] truncate">
                    {aircraft?.originName ?? "Indira Gandhi International"}
                  </div>
                </div>

                <div className="flex flex-col items-center shrink-0 px-3 text-[var(--atc-accent-text)]">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <span>FLIGHT {flightNumber}</span>
                  </div>
                  <div className="w-24 sm:w-36 h-[2px] bg-gradient-to-r from-transparent via-[var(--atc-accent)] to-transparent relative my-1">
                    <Plane className="w-3.5 h-3.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--atc-accent)]" />
                  </div>
                  <span className="text-[9px] text-[var(--atc-muted)]">
                    {aircraft?.flightKind ?? "DEPARTURE"}
                  </span>
                </div>

                <div className="flex-1 min-w-0 text-right">
                  <div className="text-[9px] text-[var(--atc-muted)] uppercase tracking-wider font-semibold">
                    DESTINATION AIRPORT
                  </div>
                  <div className="text-xl font-extrabold text-[var(--atc-text)]">
                    {aircraft?.destinationIcao ?? "VABB"}
                  </div>
                  <div className="text-[11px] text-[var(--atc-text-secondary)] truncate">
                    {aircraft?.destinationName ?? "Chhatrapati Shivaji Maharaj"}
                  </div>
                </div>
              </div>

              {/* Operator Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">AIRLINE / OPERATOR</span>
                  <span className="font-bold text-[var(--atc-text)] text-sm block">
                    {livery.airlineName}
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    IATA: {livery.iataCode} • Title: {livery.title}
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[var(--atc-muted)] block uppercase">SOULS ON BOARD</span>
                    <span className="font-bold text-[var(--atc-text)] text-sm flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      {aircraft?.soulsOnBoard ?? (spec.isCargoOnly ? 3 : 180)} POB
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[var(--atc-muted)] block uppercase">FUEL REMAINING</span>
                    <span
                      className={`font-bold text-sm flex items-center gap-1 ${
                        (aircraft?.fuelRemainingPct ?? 85) <= 15
                          ? "text-rose-500"
                          : "text-emerald-500"
                      }`}
                    >
                      <Fuel className="w-3.5 h-3.5" />
                      {aircraft?.fuelRemainingPct ?? 85}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RADAR & AVIONICS TELEMETRY */}
          {activeTab === "TELEMETRY" && (
            <div className="space-y-4">
              {/* Telemetry Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">PRESSURE ALTITUDE</span>
                  <span className="text-base font-extrabold text-[var(--atc-text)] block">
                    {aircraft ? Math.round(aircraft.altitude) : 0} ft
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    {agl} ft AGL
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">GROUND SPEED</span>
                  <span className="text-base font-extrabold text-[var(--atc-text)] block">
                    {aircraft ? Math.round(aircraft.speed) : 0} kts
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    {onGround ? "SURFACE TAXI" : "AIRBORNE"}
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">HEADING</span>
                  <span className="text-base font-extrabold text-[var(--atc-text)] block flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-amber-500" />
                    {aircraft ? Math.round(aircraft.heading).toString().padStart(3, "0") : "000"}°
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    Assigned: {aircraft?.assignedHeading !== null ? `${aircraft?.assignedHeading}°` : "NONE"}
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">VERTICAL SPEED</span>
                  <span
                    className={`text-base font-extrabold block ${
                      (aircraft?.verticalSpeed ?? 0) > 100
                        ? "text-emerald-500"
                        : (aircraft?.verticalSpeed ?? 0) < -100
                        ? "text-amber-500"
                        : "text-[var(--atc-text)]"
                    }`}
                  >
                    {aircraft && aircraft.verticalSpeed > 0 ? `+${Math.round(aircraft.verticalSpeed)}` : Math.round(aircraft?.verticalSpeed ?? 0)} fpm
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    Rate of climb/descent
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">SQUAWK CODE</span>
                  <span className="text-base font-extrabold text-[var(--atc-text)] block font-mono">
                    {aircraft?.squawk ?? "1200"}
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    Mode 3/A Transponder
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">FLIGHT PHASE</span>
                  <span className="text-sm font-bold text-[var(--atc-accent-text)] block truncate">
                    {aircraft ? getAircraftPhaseLabel(aircraft) : "UNKNOWN"}
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    State: {aircraft?.state ?? "IDLE"}
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">ATC CONTROLLER</span>
                  <span className="text-sm font-bold text-sky-400 block flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5" />
                    {aircraft?.controller ?? "TOWER"}
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    Runway: {aircraft?.targetRunway ?? "NONE"}
                  </span>
                </div>

                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
                  <span className="text-[9px] text-[var(--atc-muted)] block uppercase">COMMUNICATIONS</span>
                  <span className="text-sm font-bold text-emerald-500 block flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    {aircraft?.commStatus === "RADIO_FAILURE" ? "NORDO / 7600" : "NORMAL 2-WAY"}
                  </span>
                  <span className="text-[10px] text-[var(--atc-muted)]">
                    Mode: {aircraft?.nordoMode ?? "STANDARD"}
                  </span>
                </div>
              </div>

              {/* Active Clearances */}
              {aircraft?.clearances && aircraft.clearances.length > 0 && (
                <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] space-y-1.5">
                  <div className="text-[10px] font-bold text-[var(--atc-muted)] uppercase tracking-wider">
                    CURRENT ATC CLEARANCE LOG
                  </div>
                  <div className="space-y-1">
                    {aircraft.clearances.slice(-3).map((cl) => (
                      <div
                        key={cl.id}
                        className="text-[11px] p-2 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between gap-2"
                      >
                        <span className="font-bold text-[var(--atc-accent-text)]">
                          {cl.type}
                        </span>
                        <span className="text-[var(--atc-text)] truncate flex-1">
                          "{cl.phraseology}"
                        </span>
                        <span className="text-[9px] text-[var(--atc-muted)] font-mono">
                          {cl.acknowledged ? "ACK" : "PENDING"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =====================================================================
            MODAL FOOTER
            ===================================================================== */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--atc-border)] bg-[var(--atc-surface-alt)] text-xs font-mono shrink-0">
          <div className="text-[11px] text-[var(--atc-muted)] truncate flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">
              Click anywhere outside or press <kbd className="px-1 py-0.2 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[10px]">Esc</kbd> to return to ATC Radar
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--atc-accent)] hover:brightness-105 active:scale-95 text-stone-950 font-bold transition-all cursor-pointer shadow-sm"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
