import React, { useEffect, useState } from "react";
import { Camera, Layers, Maximize2 } from "lucide-react";
import type { AircraftTypeSpec, AirlineLivery } from "../data/aircraftCatalog.ts";
import { apiClient, type AircraftPhotoResponse } from "../services/apiClient.ts";
import type { Aircraft } from "../types/atc.ts";
import { AircraftSideProfile } from "./AircraftSideProfile.tsx";
import { AircraftDetailModal } from "./AircraftDetailModal.tsx";

interface AircraftPhotoFrameProps {
  aircraft?: Aircraft;
  icao24?: string;
  spec: AircraftTypeSpec;
  livery: AirlineLivery;
  registration: string;
  elevationFt: number;
  theme: "light" | "dark";
}

const clientPhotoCache = new Map<string, AircraftPhotoResponse>();

export const AircraftPhotoFrame: React.FC<AircraftPhotoFrameProps> = ({
  aircraft,
  icao24,
  spec,
  livery,
  registration,
  elevationFt,
  theme,
}) => {
  const effectiveIcao24 = (icao24 ?? aircraft?.icao24 ?? "").trim().toLowerCase();
  const cacheKey = `${effectiveIcao24}|${livery.airlineName}|${spec.model}|${spec.code}`;
  const [photo, setPhoto] = useState<AircraftPhotoResponse | null>(
    () => clientPhotoCache.get(cacheKey) ?? null
  );
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [viewMode, setViewMode] = useState<"PHOTO" | "SVG">("PHOTO");
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    setViewMode("PHOTO");

    const cached = clientPhotoCache.get(cacheKey);
    if (cached) {
      setPhoto(cached);
      return;
    }

    setPhoto(null);
    let cancelled = false;
    apiClient
      .getAircraftPhoto({
        icao24: effectiveIcao24 || undefined,
        preferRegistration: true,
        airline: livery.airlineName,
        model: spec.model,
        typeCode: spec.code,
        registration: registration || undefined,
      })
      .then((res) => {
        clientPhotoCache.set(cacheKey, res);
        if (!cancelled) {
          setPhoto(res);
        }
      })
      .catch(() => {
        const miss: AircraftPhotoResponse = { found: false };
        clientPhotoCache.set(cacheKey, miss);
        if (!cancelled) {
          setPhoto(miss);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, effectiveIcao24, livery.airlineName, spec.model, spec.code, registration]);

  const hasCandidatePhoto = Boolean(photo?.found && photo.url && !imgError);
  const showRealPhoto = hasCandidatePhoto && viewMode === "PHOTO" && imgLoaded;
  const isLoadingPhoto = photo === null && !imgError;

  const fallbackAircraft: Aircraft = aircraft ?? {
    id: effectiveIcao24 || registration || spec.code,
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

  return (
    <>
      <div
        onClick={() => setShowDetailModal(true)}
        title="Click to view full aircraft specifications, telemetry & high-res view"
        className="group relative rounded-lg border border-[var(--atc-border)] hover:border-[var(--atc-accent)] overflow-hidden bg-[var(--atc-surface-alt)] shadow-sm h-[132px] cursor-pointer transition-all"
      >
        {/* Technical Blueprint Profile (precision CAD elevation blueprint) */}
        <div
          className={`w-full h-full transition-opacity duration-200 ${
            showRealPhoto ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <AircraftSideProfile
            aircraft={fallbackAircraft}
            spec={spec}
            livery={livery}
            registration={registration}
            elevationFt={elevationFt}
            theme={theme}
            embedded
            isLoadingPhoto={isLoadingPhoto}
          />
        </div>

        {/* Real Aircraft Photograph Overlay */}
        {hasCandidatePhoto && photo?.url && (
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              showRealPhoto ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <img
              src={photo.url}
              alt={`${livery.airlineName} ${spec.model}`}
              loading="eager"
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgError(true);
                setImgLoaded(false);
              }}
              className="w-full h-full object-cover object-center"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
            <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-2 text-[9px] font-mono text-white/95">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/55 backdrop-blur-xs border border-white/15 truncate max-w-[75%]"
                title={
                  photo.photographer
                    ? `${photo.caption ?? spec.model} • Photo: ${photo.photographer} (${photo.source ?? "Wikimedia Commons"})`
                    : photo.caption
                }
              >
                <Camera className="w-2.5 h-2.5 text-sky-300 shrink-0" />
                <span className="truncate">
                  {photo.matchedBy === "icao24_hex"
                    ? `Tail ${registration || effectiveIcao24.toUpperCase()}`
                    : photo.matchedBy === "registration"
                    ? `Reg ${registration}`
                    : photo.matchedBy === "airline_model"
                    ? `${livery.iataCode} Livery`
                    : spec.code}{" "}
                  • {photo.photographer ?? photo.source ?? "Wikimedia"}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Controls Overlay in top right */}
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          {/* Details Expand Icon Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetailModal(true);
            }}
            title="Inspect full aircraft technical specifications and telemetry"
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold inline-flex items-center gap-1 bg-black/65 hover:bg-black/90 text-white border border-white/20 backdrop-blur-xs transition-colors cursor-pointer shadow-sm"
          >
            <Maximize2 className="w-2.5 h-2.5 text-emerald-400" />
            <span className="hidden sm:inline">DETAILS</span>
          </button>

          {/* SVG / PHOTO Switcher Button */}
          {hasCandidatePhoto && imgLoaded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode((m) => (m === "PHOTO" ? "SVG" : "PHOTO"));
              }}
              title={
                viewMode === "PHOTO"
                  ? "Switch to technical vector blueprint"
                  : "Switch back to real aircraft photograph"
              }
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold inline-flex items-center gap-1 bg-black/65 hover:bg-black/90 text-white border border-white/20 backdrop-blur-xs transition-colors cursor-pointer shadow-sm"
            >
              {viewMode === "PHOTO" ? (
                <>
                  <Layers className="w-2.5 h-2.5 text-amber-300" />
                  <span>SVG</span>
                </>
              ) : (
                <>
                  <Camera className="w-2.5 h-2.5 text-sky-300" />
                  <span>PHOTO</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Subtle Hover Cue Banner */}
        <div className="absolute inset-x-0 bottom-0 py-0.5 bg-[var(--atc-accent)]/90 text-stone-950 text-[9px] font-mono font-bold text-center tracking-wider opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          CLICK TO OPEN FULL AIRCRAFT SPECIFICATIONS & TELEMETRY ↗
        </div>
      </div>

      {/* Comprehensive Aircraft Details Modal */}
      <AircraftDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        aircraft={aircraft}
        spec={spec}
        livery={livery}
        registration={registration}
        elevationFt={elevationFt}
        photo={photo}
        theme={theme}
      />
    </>
  );
};
