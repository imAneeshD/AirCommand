import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildKeylessMapStyle, ensureMapLibreWorker } from "../utils/mapStyle.ts";
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  Eye,
  Lock,
  Plane,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { apiClient } from "../services/apiClient.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { AirportRecord, LiveAdsbTrack, LiveTrafficSnapshot } from "../types/atc.ts";
import { offlineDb } from "../utils/offlineDb.ts";
import { LocalClockBadge } from "./LocalClockBadge.tsx";

const QUICK_AIRSPACE_HUBS = [
  { icao: "VIDP", name: "Delhi (VIDP)", lat: 28.5556, lon: 77.0952 },
  { icao: "VABB", name: "Mumbai (VABB)", lat: 19.0887, lon: 72.8679 },
  { icao: "VOBL", name: "Bengaluru (VOBL)", lat: 13.1979, lon: 77.7063 },
  { icao: "OMDB", name: "Dubai (OMDB)", lat: 25.2528, lon: 55.3644 },
  { icao: "EGLL", name: "London Heathrow", lat: 51.4706, lon: -0.4619 },
  { icao: "KJFK", name: "New York JFK", lat: 40.6398, lon: -73.7789 },
];

export const LiveTrafficView: React.FC = () => {
  const theme = useAtcStore((s) => s.theme);
  const selectedAirportRecord = useAtcStore((s) => s.selectedAirportRecord);
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const launchSimulationFromLiveTraffic = useAtcStore((s) => s.launchSimulationFromLiveTraffic);

  const [center, setCenter] = useState<{ icao?: string; lat: number; lon: number; label: string }>(() =>
    selectedAirportRecord
      ? {
          icao: selectedAirportRecord.icao,
          lat: selectedAirportRecord.lat,
          lon: selectedAirportRecord.lon,
          label: `${selectedAirportRecord.icao} (${selectedAirportRecord.city})`,
        }
      : { icao: "VIDP", lat: 28.5556, lon: 77.0952, label: "VIDP (New Delhi)" }
  );
  const [snapshot, setSnapshot] = useState<LiveTrafficSnapshot | null>(null);
  const [selectedIcao24, setSelectedIcao24] = useState<string | null>(null);
  const [callsignFilter, setCallsignFilter] = useState("");
  const [altFilter, setAltFilter] = useState<"ALL" | "AIRBORNE" | "GROUND">("ALL");
  const [showTrails, setShowTrails] = useState(true);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      const snap = await apiClient.getLiveAdsb(center.lat, center.lon, 2.5);
      setSnapshot(snap);
    } catch (err) {
      setSnapshot((prev) => ({
        provider: "OpenSky Network",
        fetchedAtMs: prev?.fetchedAtMs ?? Date.now(),
        cached: true,
        rateLimited: false,
        staleThresholdMs: prev?.staleThresholdMs ?? 45000,
        error: (err as Error).message,
        tracks: prev?.tracks ?? [],
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSnapshot();
    const timer = setInterval(() => {
      void fetchSnapshot();
    }, 12000);
    return () => clearInterval(timer);
  }, [center.lat, center.lon]);

  const filteredAircraft = useMemo<LiveAdsbTrack[]>(() => {
    const list = snapshot?.tracks ?? [];
    const q = callsignFilter.trim().toUpperCase();
    return list.filter((a: LiveAdsbTrack) => {
      if (altFilter === "AIRBORNE" && a.onGround) return false;
      if (altFilter === "GROUND" && !a.onGround) return false;
      if (!q) return true;
      return (
        (a.callsign ?? "").toUpperCase().includes(q) ||
        a.icao24.toUpperCase().includes(q) ||
        (a.originCountry ?? "").toUpperCase().includes(q)
      );
    });
  }, [snapshot, callsignFilter, altFilter]);

  const selectedTrack = useMemo(
    () =>
      filteredAircraft.find((a) => a.icao24 === selectedIcao24) ??
      snapshot?.tracks.find((a: LiveAdsbTrack) => a.icao24 === selectedIcao24) ??
      null,
    [filteredAircraft, snapshot, selectedIcao24]
  );

  const pointsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: filteredAircraft.map((a) => ({
      type: "Feature" as const,
      properties: {
        icao24: a.icao24,
        callsign: a.callsign ?? a.icao24,
        trackDeg: a.trackDeg ?? 0,
        onGround: a.onGround ? 1 : 0,
        stale: a.stale ? 1 : 0,
        selected: a.icao24 === selectedIcao24 ? 1 : 0,
        label: `${a.callsign ?? a.icao24}\n${a.onGround ? "GND" : a.baroAltFt !== null ? `FL${Math.round(a.baroAltFt / 100)}` : "---"} ${a.groundSpeedKts ?? "--"}kt`,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [a.lon, a.lat],
      },
    })),
  }), [filteredAircraft, selectedIcao24]);

  const trailsGeoJson = useMemo(() => {
    if (!showTrails) return { type: "FeatureCollection" as const, features: [] };
    return {
      type: "FeatureCollection" as const,
      features: filteredAircraft
        .filter((a) => a.trail.length >= 2)
        .map((a) => ({
          type: "Feature" as const,
          properties: {
            selected: a.icao24 === selectedIcao24 ? 1 : 0,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: a.trail.map((pt) => [pt.lon, pt.lat]),
          },
        })),
    };
  }, [filteredAircraft, showTrails, selectedIcao24]);

  const latestPointsRef = useRef(pointsGeoJson);
  latestPointsRef.current = pointsGeoJson;
  const latestTrailsRef = useRef(trailsGeoJson);
  latestTrailsRef.current = trailsGeoJson;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    ensureMapLibreWorker();

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: buildKeylessMapStyle(theme, "chart"),
      center: [center.lon, center.lat],
      zoom: 8.2,
      attributionControl: false,
    });

    map.addControl(new NavigationControl(), "top-right");
    map.on("error", () => {});

    map.on("load", () => {
      mapReadyRef.current = true;

      // Crisp directional arrow/chevron icon generated on canvas for MapLibre track rotation
      const size = 32;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.translate(size / 2, size / 2);
        ctx.fillStyle = "#22d3ee";
        ctx.strokeStyle = "#082f49";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(9, 10);
        ctx.lineTo(0, 4);
        ctx.lineTo(-9, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        map.addImage("adsb-chevron", ctx.getImageData(0, 0, size, size));
      }

      map.addSource("adsb-trails", { type: "geojson", data: latestTrailsRef.current });
      map.addSource("adsb-points", { type: "geojson", data: latestPointsRef.current });

      map.addLayer({
        id: "adsb-trail-lines",
        type: "line",
        source: "adsb-trails",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], 1], "#f59e0b", "#38bdf8"],
          "line-width": ["case", ["==", ["get", "selected"], 1], 2.5, 1.3],
          "line-opacity": 0.65,
        },
      });

      map.addLayer({
        id: "adsb-selected-halo",
        type: "circle",
        source: "adsb-points",
        filter: ["==", ["get", "selected"], 1],
        paint: {
          "circle-radius": 18,
          "circle-color": "rgba(245, 158, 11, 0.25)",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f59e0b",
        },
      });

      map.addLayer({
        id: "adsb-markers",
        type: "symbol",
        source: "adsb-points",
        layout: {
          "icon-image": "adsb-chevron",
          "icon-size": ["case", ["==", ["get", "selected"], 1], 1.15, 0.85],
          "icon-rotate": ["get", "trackDeg"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "icon-opacity": ["case", ["==", ["get", "stale"], 1], 0.45, 1],
          "text-color": theme === "dark" ? "#e2e8f0" : "#0f172a",
          "text-halo-color": theme === "dark" ? "#050b14" : "#ffffff",
          "text-halo-width": 1.3,
        },
      });

      map.on("click", "adsb-markers", (e: MapLayerMouseEvent) => {
        const icao24 = e.features?.[0]?.properties?.icao24 as string | undefined;
        if (icao24) setSelectedIcao24(icao24);
      });

      map.on("mouseenter", "adsb-markers", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "adsb-markers", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const pSrc = map.getSource("adsb-points") as GeoJSONSource | undefined;
    if (pSrc) pSrc.setData(pointsGeoJson);
    const tSrc = map.getSource("adsb-trails") as GeoJSONSource | undefined;
    if (tSrc) tSrc.setData(trailsGeoJson);
  }, [pointsGeoJson, trailsGeoJson]);

  const jumpToHub = (hub: { icao: string; name: string; lat: number; lon: number }) => {
    setCenter({ icao: hub.icao, lat: hub.lat, lon: hub.lon, label: hub.name });
    mapRef.current?.flyTo({ center: [hub.lon, hub.lat], zoom: 8.5, duration: 800 });
  };

  const handleConvertToPlayableAtc = async () => {
    setConverting(true);
    try {
      let targetAirport: AirportRecord | null =
        selectedAirportRecord && center.icao && selectedAirportRecord.icao === center.icao
          ? selectedAirportRecord
          : null;

      if (!targetAirport && center.icao) {
        try {
          const detail = await apiClient.getAirportDetail(center.icao, true);
          targetAirport = detail.airport;
        } catch {
          targetAirport = offlineDb.getBundledFallbackAirport(center.icao);
        }
      }

      if (!targetAirport) {
        const nearby = await apiClient.searchAirports({
          nearLat: center.lat,
          nearLon: center.lon,
          radiusNm: 45,
          limit: 1,
        });
        targetAirport = nearby.airports[0] ?? offlineDb.getBundledFallbackAirport("VIDP");
      }

      if (targetAirport) {
        const sourceTracks = snapshot?.tracks ?? filteredAircraft;
        await launchSimulationFromLiveTraffic(targetAirport, sourceTracks, "ALL");
      }
    } finally {
      setConverting(false);
    }
  };

  const ageSec = snapshot ? Math.max(0, Math.round((Date.now() - snapshot.fetchedAtMs) / 1000)) : 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--atc-bg)] text-[var(--atc-text)] overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-[var(--atc-border)] bg-[var(--atc-panel)] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAppMode("GLOBAL_MAP")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Global Map
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">LIVE ADS-B TRAFFIC RADAR</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] text-[var(--atc-amber)]">
                <Lock className="w-3 h-3" />
                READ-ONLY OBSERVATION MODE
              </span>
            </div>
            <p className="text-[11px] text-[var(--atc-muted)]">
              Sector: {center.label} · Provider: {snapshot?.provider ?? "OpenSky Network"} · Backend Cached Poller
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <LocalClockBadge compact />
          {QUICK_AIRSPACE_HUBS.map((h) => (
            <button
              key={h.icao}
              onClick={() => jumpToHub(h)}
              className="px-2 py-1 text-[11px] font-mono rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-cyan-border)]"
            >
              {h.icao}
            </button>
          ))}
          <button
            onClick={() => void fetchSnapshot()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => void handleConvertToPlayableAtc()}
            disabled={converting}
            title="Convert this airport and its real ADS-B flights into an active AirCommand ATC game"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-[var(--atc-accent)] text-stone-950 hover:brightness-105 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {converting
              ? "Converting..."
              : `Convert & Play ATC (${snapshot?.tracks.length ?? filteredAircraft.length})`}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left Filter & List */}
        <aside className="w-80 shrink-0 border-r border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col min-h-0">
          <div className="p-3 border-b border-[var(--atc-border)] space-y-2">
            {snapshot?.error || snapshot?.rateLimited ? (
              <div className="p-2 rounded border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)] text-[11px] text-[var(--atc-amber)] flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{snapshot.error || "Rate-limit backoff active — displaying last cached tracks."}</span>
              </div>
            ) : (
              <div className="text-[11px] text-[var(--atc-emerald)] flex items-center justify-between">
                <span>Live Contacts: {filteredAircraft.length}</span>
                <span className="font-mono text-[10px] text-[var(--atc-muted)]">Updated {ageSec}s ago</span>
              </div>
            )}

            <input
              type="text"
              value={callsignFilter}
              onChange={(e) => setCallsignFilter(e.target.value)}
              placeholder="Filter callsign, ICAO24, country..."
              className="w-full px-2.5 py-1.5 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
            />

            <div className="flex items-center justify-between gap-1">
              {(["ALL", "AIRBORNE", "GROUND"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAltFilter(f)}
                  className={`flex-1 py-1 text-[10px] font-semibold rounded border ${
                    altFilter === f
                      ? "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)]"
                      : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                  }`}
                >
                  {f}
                </button>
              ))}
              <button
                onClick={() => setShowTrails((s) => !s)}
                className={`px-2 py-1 text-[10px] rounded border ${
                  showTrails
                    ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)]"
                    : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                }`}
              >
                Trails
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--atc-border)]">
            {filteredAircraft.length === 0 ? (
              <div className="p-4 text-xs text-[var(--atc-muted)]">
                No ADS-B targets matching filter in this 2.5° radius sector.
              </div>
            ) : (
              filteredAircraft.map((a) => (
                <button
                  key={a.icao24}
                  onClick={() => {
                    setSelectedIcao24(a.icao24);
                    mapRef.current?.flyTo({ center: [a.lon, a.lat], zoom: Math.max(mapRef.current.getZoom(), 9.2) });
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs ${
                    selectedIcao24 === a.icao24
                      ? "bg-[var(--atc-accent-soft)] border-l-2 border-l-[var(--atc-accent)]"
                      : "hover:bg-[var(--atc-surface-alt)]"
                  }`}
                >
                  <div>
                    <div className="font-mono font-bold flex items-center gap-1.5">
                      <span>{a.callsign}</span>
                      {a.stale && (
                        <span className="text-[9px] px-1 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)]">
                          STALE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--atc-muted)]">
                      ICAO24 {a.icao24} · {a.originCountry ?? "Unknown origin"}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <div>{a.onGround ? "GND" : a.baroAltFt !== null ? `${a.baroAltFt.toLocaleString()} ft` : "N/A"}</div>
                    <div className="text-[10px] text-[var(--atc-muted)]">
                      {a.groundSpeedKts ?? "--"} kt · {a.trackDeg ?? "--"}°
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />
        </main>

        {/* Right Telemetry Inspector (Strictly Read-Only) */}
        <aside className="w-80 shrink-0 border-l border-[var(--atc-border)] bg-[var(--atc-panel)] p-4 overflow-y-auto">
          <div className="p-2.5 mb-3 rounded border border-[var(--atc-border-strong)] bg-[var(--atc-surface-alt)] text-[11px] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[var(--atc-amber)] shrink-0 mt-0.5" />
            <span>
              <strong>Observation Only:</strong> Real ADS-B aircraft tracks cannot be issued ATC clearances or modified.
            </span>
          </div>

          {selectedTrack ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold">{selectedTrack.callsign}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)]">
                    {selectedTrack.icao24}
                  </span>
                </div>
                <p className="text-xs text-[var(--atc-muted)]">{selectedTrack.originCountry ?? "Unknown registry"}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Aircraft Type</div>
                  <div className="font-mono font-semibold">{selectedTrack.aircraftType ?? "Not reported"}</div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Registration</div>
                  <div className="font-mono font-semibold">{selectedTrack.registration ?? "Not reported"}</div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Baro Altitude</div>
                  <div className="font-mono font-semibold">
                    {selectedTrack.baroAltFt !== null ? `${selectedTrack.baroAltFt.toLocaleString()} ft` : "Unavailable"}
                  </div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Geo Altitude</div>
                  <div className="font-mono font-semibold">
                    {selectedTrack.geoAltFt !== null ? `${selectedTrack.geoAltFt.toLocaleString()} ft` : "Unavailable"}
                  </div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Ground Speed</div>
                  <div className="font-mono font-semibold">
                    {selectedTrack.groundSpeedKts !== null ? `${selectedTrack.groundSpeedKts} kt` : "N/A"}
                  </div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)] flex items-center gap-1">
                    <Compass className="w-3 h-3" /> Track
                  </div>
                  <div className="font-mono font-semibold">
                    {selectedTrack.trackDeg !== null ? `${selectedTrack.trackDeg}°` : "N/A"}
                  </div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Vertical Rate</div>
                  <div className="font-mono font-semibold">
                    {selectedTrack.verticalRateFpm !== null ? `${selectedTrack.verticalRateFpm} fpm` : "N/A"}
                  </div>
                </div>
                <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] text-[var(--atc-muted)]">Status</div>
                  <div className="font-mono font-semibold">{selectedTrack.onGround ? "ON GROUND" : "AIRBORNE"}</div>
                </div>
              </div>

              <div className="p-2.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] text-xs space-y-1 font-mono">
                <div className="text-[10px] font-sans text-[var(--atc-muted)]">Current Position</div>
                <div>
                  {selectedTrack.lat.toFixed(4)}°, {selectedTrack.lon.toFixed(4)}°
                </div>
                <div className="text-[10px] text-[var(--atc-muted)] pt-1">
                  Last Report: {new Date(selectedTrack.lastUpdatedMs).toLocaleTimeString()}
                  {selectedTrack.stale ? " (STALE)" : ""}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--atc-muted)] flex flex-col items-center justify-center py-12 text-center gap-2">
              <Eye className="w-6 h-6 opacity-50" />
              <p>Click any aircraft target on the radar map or list to inspect live ADS-B telemetry.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
