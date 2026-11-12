import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildKeylessMapStyle, ensureMapLibreWorker, type MapBasemapVariant } from "../utils/mapStyle.ts";
import {
  Compass,
  Edit3,
  Filter,
  Globe2,
  MapPin,
  Moon,
  Plane,
  Radio,
  Search,
  Sparkles,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { apiClient } from "../services/apiClient.ts";
import { useAtcStore } from "../store/atcStore.ts";
import { LocalClockBadge } from "./LocalClockBadge.tsx";
import type {
  AirportCategory,
  AirportId,
  AirportRecord,
  DifficultyLevel,
  PlayerRoleMode,
  ScenarioId,
} from "../types/atc.ts";
import { haversineNm } from "../utils/geo.ts";
import { offlineDb } from "../utils/offlineDb.ts";

const CATEGORY_OPTIONS: Array<{ id: AirportCategory | "All"; label: string }> = [
  { id: "All", label: "All Categories" },
  { id: "INTERNATIONAL", label: "International" },
  { id: "DOMESTIC", label: "Domestic" },
  { id: "CARGO", label: "Cargo" },
  { id: "MILITARY", label: "Military" },
  { id: "REGIONAL", label: "Regional" },
  { id: "GA", label: "General Aviation" },
];

const COUNTRY_QUICK_FILTERS = [
  { code: "", label: "Global" },
  { code: "IN", label: "India Priority" },
  { code: "US", label: "USA" },
  { code: "GB", label: "UK" },
  { code: "AE", label: "UAE" },
  { code: "SG", label: "Singapore" },
  { code: "DE", label: "Germany" },
  { code: "JP", label: "Japan" },
];

const INDIA_PRIORITY_ORDER = [
  "VIDP",
  "VABB",
  "VOBL",
  "VOMM",
  "VOHS",
  "VECC",
  "VOCI",
  "VOGA",
  "VOGO",
  "VAAH",
];

const LEGACY_TRAINING_AIRFIELDS: Array<{ id: AirportId; label: string; desc: string }> = [
  { id: "KAST", label: "KAST · Asteria Intl", desc: "Parallel 09L/09R" },
  { id: "KMRD", label: "KMRD · Meridian Cargo", desc: "Westbound 27L/27R" },
  { id: "KVEL", label: "KVEL · Velora Alpine", desc: "Single RWY 14/32" },
  { id: "KSOL", label: "KSOL · Solaris Hub", desc: "Midfield terminal" },
];

const SCENARIO_CHOICES: Array<{ id: ScenarioId; label: string }> = [
  { id: "LOW_TRAFFIC", label: "Low Traffic (Very Few Planes)" },
  { id: "NORMAL_OPS", label: "Normal Ops (Balanced)" },
  { id: "LIGHT", label: "Light Traffic" },
  { id: "MEDIUM", label: "Medium Traffic" },
  { id: "HEAVY", label: "Heavy Traffic" },
  { id: "RUSH_HOUR", label: "Rush Hour Push" },
  { id: "ARRIVAL_HEAVY", label: "Arrival Rush" },
  { id: "DEPARTURE_HEAVY", label: "Departure Bank" },
  { id: "MIXED", label: "Mixed Ops" },
  { id: "EMERGENCY", label: "Emergency & Radio Loss" },
];

function qualityBadgeColor(q: AirportRecord["dataQuality"]): string {
  switch (q) {
    case "Verified":
      return "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]";
    case "Manually edited":
      return "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]";
    case "Imported":
      return "bg-[var(--atc-accent-soft)] text-[var(--atc-accent-text)] border-[var(--atc-accent-border)]";
    case "Incomplete":
    case "Needs review":
      return "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]";
  }
}

export const GlobalAirportMap: React.FC = () => {
  const theme = useAtcStore((s) => s.theme);
  const toggleTheme = useAtcStore((s) => s.toggleTheme);
  const isOnline = useAtcStore((s) => s.isOnline);
  const sim = useAtcStore((s) => s.sim);
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const selectAndSaveAirport = useAtcStore((s) => s.selectAndSaveAirport);
  const selectedAirportRecord = useAtcStore((s) => s.selectedAirportRecord);
  const selectedAirportGeoJson = useAtcStore((s) => s.selectedAirportGeoJson);
  const airportDetailLoading = useAtcStore((s) => s.airportDetailLoading);
  const airportDetailError = useAtcStore((s) => s.airportDetailError);
  const inspectGlobalAirport = useAtcStore((s) => s.inspectGlobalAirport);
  const launchRealAirportSimulation = useAtcStore((s) => s.launchRealAirportSimulation);
  const launchSimulationFromLiveTraffic = useAtcStore((s) => s.launchSimulationFromLiveTraffic);
  const createMultiplayerRoom = useAtcStore((s) => s.createMultiplayerRoom);
  const joinMultiplayerRoom = useAtcStore((s) => s.joinMultiplayerRoom);
  const playerName = useAtcStore((s) => s.playerName);
  const setPlayerName = useAtcStore((s) => s.setPlayerName);

  const [catalog, setCatalog] = useState<AirportRecord[]>([]);
  const [filteredResults, setFilteredResults] = useState<AirportRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("IN");
  const [categoryFilter, setCategoryFilter] = useState<AirportCategory | "All">("All");
  const [nearbyCenter, setNearbyCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(sim.scenarioId || "NORMAL_OPS");
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>("STANDARD");
  const [selectedStartRole, setSelectedStartRole] = useState<PlayerRoleMode>("ALL");
  const [joinCode, setJoinCode] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [basemapVariant, setBasemapVariant] = useState<MapBasemapVariant>("chart");
  const [convertingLive, setConvertingLive] = useState(false);
  const [seedMpWithLive, setSeedMpWithLive] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);
  const viewStateRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  // 1. Load initial airport catalog from offline IndexedDB / bundled JSON, then refresh via API when online
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingList(true);
      const cached = await offlineDb.getAllCachedAirports();
      if (alive && cached.length > 0) {
        setCatalog(cached);
        // Auto-select VIDP (Indira Gandhi International Airport) as India-first default preview if none chosen
        if (!selectedAirportRecord) {
          const defaultVidp = cached.find((a) => a.icao === "VIDP") ?? cached[0];
          if (defaultVidp) void inspectGlobalAirport(defaultVidp);
        }
      }
      if (isOnline) {
        try {
          const res = await apiClient.searchAirports({ limit: 800 });
          if (alive && res.airports.length > 0) {
            await offlineDb.cacheAirports(res.airports);
            const merged = await offlineDb.getAllCachedAirports();
            setCatalog(merged);
            if (!useAtcStore.getState().selectedAirportRecord) {
              const vidp = merged.find((a) => a.icao === "VIDP") ?? merged[0];
              if (vidp) void inspectGlobalAirport(vidp);
            }
          }
        } catch {
          // Offline / backend not running — cached data already populated cleanly
        }
      }
      if (alive) setLoadingList(false);
    })();
    return () => {
      alive = false;
    };
  }, [isOnline]);

  // 2. Execute search / filter / nearby against backend (or offline IndexedDB fallback)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const qUpper = searchQuery.trim().toUpperCase();
      // When user explicitly searches by ICAO/IATA/name globally, don't trap them in a country tab unless selected manually with empty query
      const effectiveCountry = qUpper && countryFilter === "IN" ? "" : countryFilter;

      if (isOnline && (qUpper || nearbyCenter || effectiveCountry || categoryFilter !== "All")) {
        try {
          const res = await apiClient.searchAirports({
            q: qUpper || undefined,
            country: effectiveCountry || undefined,
            category: categoryFilter,
            nearLat: nearbyCenter?.lat,
            nearLon: nearbyCenter?.lon,
            radiusNm: nearbyCenter ? 250 : undefined,
            limit: 180,
          });
          if (!cancelled && res.airports.length > 0) {
            setFilteredResults(res.airports);
            return;
          }
        } catch {
          // Fallback silently to local catalog
        }
      }

      const local = catalog.filter((a) => {
        if (categoryFilter !== "All" && a.category !== categoryFilter) return false;
        if (effectiveCountry && a.isoCountry !== effectiveCountry) return false;
        if (nearbyCenter) {
          const d = haversineNm(nearbyCenter.lat, nearbyCenter.lon, a.lat, a.lon);
          if (d > 250) return false;
        }
        if (!qUpper) return true;
        const goaAlias = qUpper === "VAGO" && (a.icao === "VOGA" || a.icao === "VOGO");
        return (
          goaAlias ||
          a.icao.toUpperCase().includes(qUpper) ||
          (a.iata ?? "").toUpperCase().includes(qUpper) ||
          a.name.toUpperCase().includes(qUpper) ||
          a.city.toUpperCase().includes(qUpper) ||
          a.country.toUpperCase().includes(qUpper)
        );
      });

      local.sort((a, b) => {
        if (nearbyCenter) {
          return (
            haversineNm(nearbyCenter.lat, nearbyCenter.lon, a.lat, a.lon) -
            haversineNm(nearbyCenter.lat, nearbyCenter.lon, b.lat, b.lon)
          );
        }
        const aPrio = INDIA_PRIORITY_ORDER.indexOf(a.icao);
        const bPrio = INDIA_PRIORITY_ORDER.indexOf(b.icao);
        if (aPrio !== -1 || bPrio !== -1) {
          return (aPrio === -1 ? 999 : aPrio) - (bPrio === -1 ? 999 : bPrio);
        }
        return (b.runwayCount ?? b.runways.length) - (a.runwayCount ?? a.runways.length) || a.icao.localeCompare(b.icao);
      });

      if (!cancelled) setFilteredResults(local.slice(0, 180));
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [catalog, searchQuery, countryFilter, categoryFilter, nearbyCenter, isOnline]);

  // 3. Build GeoJSON for map markers (shows filtered set when actively filtering, or entire catalog)
  const mapAirportsGeoJson = useMemo(() => {
    const sourceList =
      searchQuery || categoryFilter !== "All" || countryFilter !== "" || nearbyCenter
        ? filteredResults.length > 0
          ? filteredResults
          : catalog
        : catalog;

    return {
      type: "FeatureCollection" as const,
      features: sourceList.map((a) => ({
        type: "Feature" as const,
        properties: {
          icao: a.icao,
          iata: a.iata ?? "",
          name: a.name,
          category: a.category,
          isoCountry: a.isoCountry,
          isSelected: selectedAirportRecord?.icao === a.icao ? 1 : 0,
          isPriority: INDIA_PRIORITY_ORDER.includes(a.icao) ? 1 : 0,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [a.lon, a.lat],
        },
      })),
    };
  }, [catalog, filteredResults, searchQuery, categoryFilter, countryFilter, nearbyCenter, selectedAirportRecord]);

  // 4. Build GeoJSON overlay for selected airport's real runways / OSM infrastructure
  const selectedRunwayOverlayGeoJson = useMemo(() => {
    if (selectedAirportGeoJson && selectedAirportGeoJson.features.length > 0) {
      return selectedAirportGeoJson;
    }
    if (!selectedAirportRecord) {
      return { type: "FeatureCollection" as const, features: [] };
    }
    const feats = selectedAirportRecord.runways
      .filter(
        (r) =>
          r.leLat !== undefined &&
          r.leLon !== undefined &&
          r.heLat !== undefined &&
          r.heLon !== undefined
      )
      .map((r) => ({
        type: "Feature" as const,
        id: r.id,
        properties: {
          aeroway: "runway",
          ref: `${r.leIdent}/${r.heIdent}`,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [r.leLon!, r.leLat!],
            [r.heLon!, r.heLat!],
          ],
        },
      }));
    return { type: "FeatureCollection" as const, features: feats };
  }, [selectedAirportRecord, selectedAirportGeoJson]);

  const latestAirportsGeoJsonRef = useRef(mapAirportsGeoJson);
  latestAirportsGeoJsonRef.current = mapAirportsGeoJson;
  const latestOverlayGeoJsonRef = useRef(selectedRunwayOverlayGeoJson);
  latestOverlayGeoJsonRef.current = selectedRunwayOverlayGeoJson;

  // 5. Initialize MapLibre GL map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    ensureMapLibreWorker();

    const initialCenter: [number, number] =
      viewStateRef.current?.center ??
      (selectedAirportRecord ? [selectedAirportRecord.lon, selectedAirportRecord.lat] : [78.96, 20.59]);
    const initialZoom = viewStateRef.current?.zoom ?? 4.1;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: buildKeylessMapStyle(theme, basemapVariant),
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 1.3,
      maxZoom: 17,
      attributionControl: false,
    });

    map.addControl(new NavigationControl({ showCompass: true }), "top-right");

    map.on("moveend", () => {
      const c = map.getCenter();
      viewStateRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    });

    map.on("error", () => {
      // Keep running seamlessly when raster tiles are unavailable offline
    });

    map.on("load", () => {
      mapReadyRef.current = true;

      map.addSource("airports-source", {
        type: "geojson",
        data: latestAirportsGeoJsonRef.current,
        cluster: true,
        clusterMaxZoom: 6,
        clusterRadius: 42,
      });

      map.addSource("selected-overlay", {
        type: "geojson",
        data: latestOverlayGeoJsonRef.current as GeoJSON.FeatureCollection,
      });

      // Selected airport infrastructure polygons / aprons / taxiways / runways
      map.addLayer({
        id: "selected-aprons",
        type: "fill",
        source: "selected-overlay",
        minzoom: 11,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": ["match", ["get", "aeroway"], "terminal", "#38bdf8", "apron", "#64748b", "#475569"],
          "fill-opacity": 0.45,
        },
      });

      map.addLayer({
        id: "selected-taxiways",
        type: "line",
        source: "selected-overlay",
        minzoom: 11,
        filter: ["==", ["get", "aeroway"], "taxiway"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2.4,
        },
      });

      map.addLayer({
        id: "selected-runways",
        type: "line",
        source: "selected-overlay",
        minzoom: 9,
        filter: ["==", ["get", "aeroway"], "runway"],
        paint: {
          "line-color": "#f8fafc",
          "line-width": 5,
        },
      });

      // Clustered circles when zoomed out
      map.addLayer({
        id: "airport-clusters",
        type: "circle",
        source: "airports-source",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#0284c7",
            15,
            "#d97706",
            60,
            "#059669",
          ],
          "circle-radius": ["step", ["get", "point_count"], 15, 15, 20, 60, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.88,
        },
      });

      map.addLayer({
        id: "airport-cluster-count",
        type: "symbol",
        source: "airports-source",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Distinct halo around selected airport
      map.addLayer({
        id: "airport-selected-ring",
        type: "circle",
        source: "airports-source",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "isSelected"], 1]],
        paint: {
          "circle-radius": 14,
          "circle-color": "rgba(245, 158, 11, 0.25)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#f59e0b",
        },
      });

      // Individual airport points
      map.addLayer({
        id: "airport-points",
        type: "circle",
        source: "airports-source",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "isSelected"], 1],
            7.5,
            ["==", ["get", "isPriority"], 1],
            6,
            4.5,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "INTERNATIONAL",
            "#0ea5e9",
            "CARGO",
            "#f97316",
            "MILITARY",
            "#ef4444",
            "DOMESTIC",
            "#10b981",
            "REGIONAL",
            "#8b5cf6",
            "#64748b",
          ],
          "circle-stroke-width": 1.4,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Uncluttered zoom-gated labels
      map.addLayer({
        id: "airport-labels",
        type: "symbol",
        source: "airports-source",
        filter: ["!", ["has", "point_count"]],
        minzoom: 5.2,
        layout: {
          "text-field": [
            "case",
            ["!=", ["get", "iata"], ""],
            ["concat", ["get", "icao"], " · ", ["get", "iata"]],
            ["get", "icao"],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": theme === "dark" ? "#e2e8f0" : "#1c1917",
          "text-halo-color": theme === "dark" ? "#060b12" : "#ffffff",
          "text-halo-width": 1.4,
        },
      });

      map.on("click", "airport-clusters", async (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["airport-clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const src = map.getSource("airports-source") as GeoJSONSource | undefined;
        if (!src || clusterId === undefined) return;
        const zoom = await src.getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: zoom + 0.4 });
      });

      map.on("click", "airport-points", (e: MapLayerMouseEvent) => {
        const icao = e.features?.[0]?.properties?.icao as string | undefined;
        if (!icao) return;
        const match =
          useAtcStore.getState().selectedAirportRecord?.icao === icao
            ? useAtcStore.getState().selectedAirportRecord
            : catalog.find((c) => c.icao === icao) ?? offlineDb.getBundledFallbackAirport(icao);
        if (match) {
          void inspectGlobalAirport(match);
          map.flyTo({ center: [match.lon, match.lat], zoom: Math.max(map.getZoom(), 9.2), duration: 750 });
        }
      });

      map.on("mouseenter", "airport-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "airport-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "airport-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "airport-clusters", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [theme, basemapVariant]);

  // 6. Push updated GeoJSON sources whenever search filter or selected airport changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const src = map.getSource("airports-source") as GeoJSONSource | undefined;
    if (src) src.setData(mapAirportsGeoJson);
    const overlaySrc = map.getSource("selected-overlay") as GeoJSONSource | undefined;
    if (overlaySrc) overlaySrc.setData(selectedRunwayOverlayGeoJson as GeoJSON.FeatureCollection);
  }, [mapAirportsGeoJson, selectedRunwayOverlayGeoJson]);

  const handleSelectListItem = (record: AirportRecord) => {
    void inspectGlobalAirport(record);
    mapRef.current?.flyTo({
      center: [record.lon, record.lat],
      zoom: 12.2,
      duration: 850,
    });
  };

  const handleFindNearby = () => {
    setStatusNote("Locating nearby airports...");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setCountryFilter("");
          setNearbyCenter({ lat: latitude, lon: longitude });
          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 7.5 });
          setStatusNote(`Showing airports within 250 NM of your location (${latitude.toFixed(2)}, ${longitude.toFixed(2)}).`);
        },
        () => {
          const center = mapRef.current?.getCenter() ?? { lat: 28.55, lng: 77.1 };
          setCountryFilter("");
          setNearbyCenter({ lat: center.lat, lon: center.lng });
          setStatusNote(`Browser GPS unavailable — showing airports near map center (${center.lat.toFixed(2)}, ${center.lng.toFixed(2)}).`);
        },
        { timeout: 3500 }
      );
    } else {
      const center = mapRef.current?.getCenter() ?? { lat: 28.55, lng: 77.1 };
      setCountryFilter("");
      setNearbyCenter({ lat: center.lat, lon: center.lng });
      setStatusNote(`Showing airports near map center (${center.lat.toFixed(2)}, ${center.lng.toFixed(2)}).`);
    }
  };

  const handleCreateMultiplayer = async () => {
    const targetIcao = selectedAirportRecord?.icao ?? "VIDP";
    await createMultiplayerRoom({
      airportIcao: targetIcao,
      scenarioId: selectedScenario,
      difficulty: selectedDifficulty,
      preferredRole: "TOWER",
      seedFromLive: seedMpWithLive,
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--atc-bg)] text-[var(--atc-text)] overflow-hidden">
      {/* Top Global Command Header */}
      <header className="h-14 shrink-0 border-b border-[var(--atc-border)] bg-[var(--atc-panel)] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center shrink-0">
            <Globe2 className="w-5 h-5 text-[var(--atc-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-sm">AIRCOMMAND</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)]">
                GLOBAL ATC
              </span>
            </div>
            <p className="text-[11px] text-[var(--atc-muted)] truncate">
              OurAirports + OpenStreetMap + Live ADS-B + 3-Player Multiplayer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <LocalClockBadge compact />
          {/* Online / Offline status */}
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
              isOnline
                ? "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]"
                : "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]"
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? "Online" : "Offline (Local Cache)"}
          </span>

          {/* Player Name & Join Code */}
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Callsign / Name"
            aria-label="Controller Display Name"
            className="w-28 px-2 py-1 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text)]"
          />

          <div className="flex items-center gap-1 bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded px-1.5 py-0.5">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim() && isOnline) {
                  joinMultiplayerRoom(joinCode);
                }
              }}
              placeholder="ROOM CODE"
              maxLength={8}
              className="w-20 bg-transparent text-xs font-mono uppercase focus:outline-none"
            />
            <button
              onClick={() => joinCode && joinMultiplayerRoom(joinCode)}
              disabled={!joinCode || !isOnline}
              className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border border-[var(--atc-cyan-border)] disabled:opacity-40"
            >
              Join Room
            </button>
          </div>

          <button
            onClick={() => setAppMode("LIVE_OBSERVATION")}
            disabled={!isOnline}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--atc-border-strong)] bg-[var(--atc-surface)] hover:border-[var(--atc-cyan-border)] disabled:opacity-45"
          >
            <Radio className="w-3.5 h-3.5 text-[var(--atc-cyan)]" />
            Live ADS-B Globe
          </button>

          <button
            onClick={toggleTheme}
            title="Toggle Light / Dark theme"
            className="p-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-text-secondary)] hover:border-[var(--atc-accent-border)]"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setAppMode("SIMULATION")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)]"
          >
            Resume ({sim.airport.icao})
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Left Sidebar: Search, Category Filters, Results + Legacy Training Fields */}
        <aside className="w-full lg:w-[340px] shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col min-h-0 max-h-[42vh] lg:max-h-none">
          <div className="p-3 border-b border-[var(--atc-border)] space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--atc-muted)] absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ICAO, IATA, name, city (e.g. VIDP, DEL, VABB)..."
                className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface)] focus:outline-none focus:border-[var(--atc-cyan-border)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2 text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category & Nearby Row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                <Filter className="w-3.5 h-3.5 text-[var(--atc-muted)] shrink-0" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as AirportCategory | "All")}
                  className="w-full bg-transparent text-xs focus:outline-none"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[var(--atc-surface)]">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleFindNearby}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] font-medium shrink-0"
              >
                <Compass className="w-3.5 h-3.5" />
                Nearby
              </button>
            </div>

            {/* Country Quick Pills */}
            <div className="flex flex-wrap gap-1">
              {COUNTRY_QUICK_FILTERS.map((c) => (
                <button
                  key={c.code || "ALL"}
                  onClick={() => {
                    setNearbyCenter(null);
                    setStatusNote(null);
                    setCountryFilter(c.code);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                    countryFilter === c.code && !nearbyCenter
                      ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-semibold"
                      : "bg-[var(--atc-surface)] border-[var(--atc-border)] text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {nearbyCenter && (
                <button
                  onClick={() => {
                    setNearbyCenter(null);
                    setStatusNote(null);
                  }}
                  className="px-2 py-0.5 text-[10px] rounded border border-[var(--atc-red-border)] bg-[var(--atc-red-bg)] text-[var(--atc-red)]"
                >
                  Clear Nearby ×
                </button>
              )}
            </div>

            {statusNote && (
              <p className="text-[10px] text-[var(--atc-cyan)] leading-tight">{statusNote}</p>
            )}
          </div>

          {/* Scrollable Airport Results List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--atc-border)]">
            {loadingList && filteredResults.length === 0 ? (
              <div className="p-4 text-xs text-[var(--atc-muted)]">Loading airport database...</div>
            ) : filteredResults.length === 0 ? (
              <div className="p-4 text-xs text-[var(--atc-muted)]">
                No airports match your current search or category filters.
              </div>
            ) : (
              filteredResults.map((a) => {
                const isSel = selectedAirportRecord?.icao === a.icao;
                return (
                  <button
                    key={a.icao}
                    onClick={() => handleSelectListItem(a)}
                    className={`w-full text-left px-3 py-2.5 transition-colors flex items-start justify-between gap-2 ${
                      isSel
                        ? "bg-[var(--atc-accent-soft)] border-l-2 border-l-[var(--atc-accent)]"
                        : "hover:bg-[var(--atc-surface-alt)]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-[var(--atc-text)]">
                          {a.icao}
                        </span>
                        {a.iata && (
                          <span className="font-mono text-[10px] px-1 rounded bg-[var(--atc-surface)] border border-[var(--atc-border)] text-[var(--atc-muted)]">
                            {a.iata}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--atc-surface)] text-[var(--atc-muted)]">
                          {a.category}
                        </span>
                      </div>
                      <p className="text-xs font-medium truncate mt-0.5">{a.name}</p>
                      <p className="text-[11px] text-[var(--atc-muted)] truncate">
                        {a.city}, {a.country} · {a.elevationFt} ft
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-[var(--atc-muted)] block">
                        {a.runwayCount} RWY
                      </span>
                      <span
                        className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded border ${qualityBadgeColor(
                          a.dataQuality
                        )}`}
                      >
                        {a.dataQuality}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Legacy Fictional Phase 1 Training Airfields Footer */}
          <div className="p-2.5 border-t border-[var(--atc-border)] bg-[var(--atc-surface-alt)]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--atc-muted)] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[var(--atc-accent)]" />
                Phase 1 Training Fields
              </span>
              <span className="text-[10px] text-[var(--atc-muted)]">Instant Offline</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {LEGACY_TRAINING_AIRFIELDS.map((af) => (
                <button
                  key={af.id}
                  onClick={() => selectAndSaveAirport(af.id, selectedScenario, selectedStartRole)}
                  className="text-left px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-accent-border)] text-[10px]"
                >
                  <div className="font-mono font-bold text-[var(--atc-text)]">{af.id}</div>
                  <div className="text-[9px] text-[var(--atc-muted)] truncate">{af.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Interactive MapLibre Globe */}
        <main className="flex-1 relative min-h-[260px]">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Basemap Style Toggle (Chart vs Satellite Imagery) */}
          <div className="absolute top-3 left-3 z-10 flex items-center bg-[var(--atc-panel)]/95 border border-[var(--atc-border)] rounded-lg p-0.5 shadow">
            {(["chart", "satellite"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setBasemapVariant(v)}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded-md transition-colors ${
                  basemapVariant === v
                    ? "bg-[var(--atc-accent-soft)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                    : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
                }`}
              >
                {v === "chart" ? "Chart" : "Satellite"}
              </button>
            ))}
          </div>

          {/* Floating Map Legend Overlay */}
          <div className="absolute bottom-3 left-3 z-10 px-2.5 py-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-panel)]/90 backdrop-blur text-[10px] flex flex-wrap items-center gap-3 shadow">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9]" /> International
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /> Domestic
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> Cargo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Military
            </span>
            <span className="text-[var(--atc-muted)]">
              Zoom ≥ 9 previews real runways · {catalog.length} airports loaded
            </span>
          </div>
        </main>

        {/* Right Preview & Launch Inspector Panel */}
        <aside className="w-full lg:w-[370px] shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--atc-border)] bg-[var(--atc-panel)] flex flex-col min-h-0 overflow-y-auto">
          {selectedAirportRecord ? (
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold">{selectedAirportRecord.icao}</span>
                      {selectedAirportRecord.iata && (
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                          {selectedAirportRecord.iata}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded border font-medium ${qualityBadgeColor(
                          selectedAirportRecord.dataQuality
                        )}`}
                      >
                        {selectedAirportRecord.dataQuality}
                      </span>
                    </div>
                    <h2 className="text-sm font-semibold mt-1 leading-snug">
                      {selectedAirportRecord.name}
                    </h2>
                    <p className="text-xs text-[var(--atc-muted)] flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {selectedAirportRecord.city}, {selectedAirportRecord.country}
                    </p>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                    <div className="text-[10px] text-[var(--atc-muted)]">Elevation</div>
                    <div className="font-mono text-xs font-semibold">
                      {selectedAirportRecord.elevationFt} ft
                    </div>
                  </div>
                  <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                    <div className="text-[10px] text-[var(--atc-muted)]">Category</div>
                    <div className="text-xs font-semibold truncate">
                      {selectedAirportRecord.category}
                    </div>
                  </div>
                  <div className="p-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                    <div className="text-[10px] text-[var(--atc-muted)]">Timezone</div>
                    <div className="text-xs font-semibold truncate">
                      {selectedAirportRecord.timezone}
                    </div>
                  </div>
                </div>
              </div>

              {/* Infrastructure / OSM Warning or Confirmed Status */}
              {airportDetailLoading ? (
                <div className="text-xs text-[var(--atc-cyan)] px-3 py-2 rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)]">
                  Checking OurAirports & OpenStreetMap infrastructure...
                </div>
              ) : airportDetailError ? (
                <div className="text-[11px] text-[var(--atc-amber)] px-3 py-2 rounded border border-[var(--atc-amber-border)] bg-[var(--atc-amber-bg)]">
                  {airportDetailError} — Simulation builds verified runways + standard parallel taxiway graph, or use the Geometry Editor to add OSM features.
                </div>
              ) : selectedAirportGeoJson && selectedAirportGeoJson.features.length > 0 ? (
                <div className="text-[11px] text-[var(--atc-emerald)] px-3 py-2 rounded border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)]">
                  Infrastructure loaded: {selectedAirportGeoJson.features.length} GeoJSON features ({selectedAirportRecord.source}).
                </div>
              ) : (
                <div className="text-[11px] text-[var(--atc-muted)] px-3 py-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  OurAirports verified runway coordinates loaded. Click "Edit Airport Geometry" to customize taxiways & gates.
                </div>
              )}

              {/* Runways */}
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--atc-muted)] mb-1.5">
                  Runways ({selectedAirportRecord.runways.length})
                </h3>
                {selectedAirportRecord.runways.length === 0 ? (
                  <p className="text-xs text-[var(--atc-amber)]">No runway records in database (Incomplete).</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedAirportRecord.runways.map((r) => (
                      <div
                        key={r.id}
                        className="px-2.5 py-1.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-bold">
                          RWY {r.leIdent}/{r.heIdent}
                        </span>
                        <span className="text-[var(--atc-muted)] font-mono">
                          {r.lengthFt.toLocaleString()} × {r.widthFt} ft · {r.surface}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Frequencies & Navaids */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] font-semibold uppercase text-[var(--atc-muted)] mb-1">
                    Frequencies ({selectedAirportRecord.frequencies.length})
                  </div>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto text-[11px]">
                    {selectedAirportRecord.frequencies.length === 0 ? (
                      <span className="text-[var(--atc-muted)]">Not published</span>
                    ) : (
                      selectedAirportRecord.frequencies.slice(0, 6).map((f) => (
                        <div key={f.id} className="flex justify-between gap-1 font-mono">
                          <span className="truncate text-[var(--atc-muted)]">{f.type}</span>
                          <span>{f.frequencyMhz.toFixed(3)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]">
                  <div className="text-[10px] font-semibold uppercase text-[var(--atc-muted)] mb-1">
                    Navaids ({selectedAirportRecord.navaids.length})
                  </div>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto text-[11px]">
                    {selectedAirportRecord.navaids.length === 0 ? (
                      <span className="text-[var(--atc-muted)]">None associated</span>
                    ) : (
                      selectedAirportRecord.navaids.slice(0, 6).map((n) => (
                        <div key={n.ident + n.type} className="flex justify-between gap-1 font-mono">
                          <span className="font-semibold">{n.ident}</span>
                          <span className="text-[var(--atc-muted)] truncate">{n.type}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Simulation Launch Configuration */}
              <div className="p-3 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--atc-muted)]">
                  Session Setup
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[var(--atc-muted)] block mb-0.5">Scenario</label>
                    <select
                      value={selectedScenario}
                      onChange={(e) => setSelectedScenario(e.target.value as ScenarioId)}
                      className="w-full px-2 py-1 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-panel)]"
                    >
                      {SCENARIO_CHOICES.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--atc-muted)] block mb-0.5">
                      Difficulty (MP)
                    </label>
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value as DifficultyLevel)}
                      className="w-full px-2 py-1 text-xs rounded border border-[var(--atc-border)] bg-[var(--atc-panel)]"
                    >
                      <option value="EASY">Easy</option>
                      <option value="STANDARD">Standard</option>
                      <option value="CHALLENGING">Challenging</option>
                      <option value="EXPERT">Expert</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--atc-muted)] block mb-1">
                    Solo Controller Role
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {(["ALL", "GROUND", "TOWER", "DEPARTURE"] as PlayerRoleMode[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setSelectedStartRole(r)}
                        className={`py-1 text-[10px] font-semibold rounded border ${
                          selectedStartRole === r
                            ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)]"
                            : "bg-[var(--atc-panel)] border-[var(--atc-border)] text-[var(--atc-muted)]"
                        }`}
                      >
                        {r === "ALL" ? "ALL AUTO" : r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Integrated Game Mode Actions */}
              <div className="space-y-2">
                <button
                  onClick={() =>
                    void launchRealAirportSimulation(
                      selectedAirportRecord,
                      selectedScenario,
                      selectedStartRole
                    )
                  }
                  disabled={airportDetailLoading}
                  className="w-full py-2.5 px-3 rounded-lg bg-[var(--atc-accent)] text-stone-950 font-bold text-xs flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-50"
                >
                  <Plane className="w-4 h-4" />
                  Play Solo ATC Simulation ({selectedAirportRecord.icao})
                </button>

                <button
                  onClick={async () => {
                    setConvertingLive(true);
                    const res = await launchSimulationFromLiveTraffic(
                      selectedAirportRecord,
                      undefined,
                      selectedStartRole
                    );
                    setConvertingLive(false);
                    if (!res.ok) {
                      setStatusNote(
                        `Live flight conversion failed for ${selectedAirportRecord.icao}: ${
                          res.error ?? "Backend unavailable."
                        }`
                      );
                    }
                  }}
                  disabled={!isOnline || airportDetailLoading || convertingLive}
                  className="w-full py-2.5 px-3 rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] font-bold text-xs flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-45"
                >
                  <Radio className="w-4 h-4" />
                  {convertingLive
                    ? "Converting Real Live Flights..."
                    : `Convert Live Flights → Play ATC (${selectedAirportRecord.icao})`}
                </button>

                <label className="flex items-center gap-2 px-2 py-1 text-[11px] text-[var(--atc-muted)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={seedMpWithLive}
                    onChange={(e) => setSeedMpWithLive(e.target.checked)}
                    className="rounded border-[var(--atc-border)]"
                  />
                  Seed 3-Player Co-op Room with Live ADS-B Flights
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCreateMultiplayer}
                    disabled={!isOnline}
                    className="py-2 px-2.5 rounded-lg border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45"
                  >
                    <Users className="w-3.5 h-3.5" />
                    3-Player Co-op
                  </button>

                  <button
                    onClick={() => setAppMode("LIVE_OBSERVATION")}
                    disabled={!isOnline}
                    className="py-2 px-2.5 rounded-lg border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Live ADS-B
                  </button>
                </div>

                <button
                  onClick={() => setAppMode("AIRPORT_EDITOR")}
                  className="w-full py-2 px-3 rounded-lg border border-[var(--atc-border-strong)] bg-[var(--atc-surface)] hover:border-[var(--atc-accent-border)] text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Airport Geometry (Taxiways / Gates / Hold-Shorts)
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-xs text-[var(--atc-muted)]">
              Select an airport from the global map or search list to inspect runways, navaids, live ADS-B traffic, or start ATC operations.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
