import React, { useEffect, useState } from "react";
import { Camera, Layers } from "lucide-react";
import type { AircraftTypeSpec, AirlineLivery } from "../data/aircraftCatalog.ts";
import { apiClient, type AircraftPhotoResponse } from "../services/apiClient.ts";
import type { Aircraft } from "../types/atc.ts";
import { AircraftSideProfile } from "./AircraftSideProfile.tsx";

interface AircraftPhotoFrameProps {
  aircraft: Aircraft;
  spec: AircraftTypeSpec;
  livery: AirlineLivery;
  registration: string;
  elevationFt: number;
  theme: "light" | "dark";
}

const clientPhotoCache = new Map<string, AircraftPhotoResponse>();

export const AircraftPhotoFrame: React.FC<AircraftPhotoFrameProps> = ({
  aircraft,
  spec,
  livery,
  registration,
  elevationFt,
  theme,
}) => {
  const cacheKey = `${livery.airlineName}|${spec.model}|${spec.code}`;
  const [photo, setPhoto] = useState<AircraftPhotoResponse | null>(
    () => clientPhotoCache.get(cacheKey) ?? null
  );
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [viewMode, setViewMode] = useState<"PHOTO" | "SVG">("PHOTO");

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
        airline: livery.airlineName,
        model: spec.model,
        typeCode: spec.code,
        registration,
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
  }, [cacheKey, livery.airlineName, spec.model, spec.code, registration]);

  const hasCandidatePhoto = Boolean(photo?.found && photo.url && !imgError);
  const showRealPhoto = hasCandidatePhoto && viewMode === "PHOTO" && imgLoaded;

  return (
    <div className="relative rounded-lg border border-[var(--atc-border)] overflow-hidden bg-[var(--atc-surface-alt)] shadow-sm h-[132px]">
      {/* Fallback / Existing Vector Profile (always ready immediately and shown whenever photo is unavailable or SVG selected) */}
      <div
        className={`w-full h-full transition-opacity duration-200 ${
          showRealPhoto ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <AircraftSideProfile
          aircraft={aircraft}
          spec={spec}
          livery={livery}
          registration={registration}
          elevationFt={elevationFt}
          theme={theme}
          embedded
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
                {photo.matchedBy === "airline_model" ? `${livery.iataCode} Livery` : spec.code} •{" "}
                {photo.photographer ?? photo.source ?? "Wikimedia"}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Mode Switcher Badge when real photo is loaded */}
      {hasCandidatePhoto && imgLoaded && (
        <button
          type="button"
          onClick={() => setViewMode((m) => (m === "PHOTO" ? "SVG" : "PHOTO"))}
          title={
            viewMode === "PHOTO"
              ? "Switch to technical vector aircraft profile"
              : "Switch back to real aircraft photograph"
          }
          className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold inline-flex items-center gap-1 bg-black/65 hover:bg-black/85 text-white border border-white/20 backdrop-blur-xs transition-colors cursor-pointer"
        >
          {viewMode === "PHOTO" ? (
            <>
              <Layers className="w-2.5 h-2.5 text-amber-300" />
              SVG
            </>
          ) : (
            <>
              <Camera className="w-2.5 h-2.5 text-sky-300" />
              PHOTO
            </>
          )}
        </button>
      )}
    </div>
  );
};
