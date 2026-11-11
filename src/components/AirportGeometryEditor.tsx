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
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  MapPin,
  Plane,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import type { AirportGeoJsonCollection, AirportGeoJsonFeature } from "../types/atc.ts";

type EditTool =
  | "SELECT"
  | "ADD_TAXIWAY"
  | "ADD_RUNWAY"
  | "ADD_GATE"
  | "ADD_HOLD_POINT"
  | "ADD_PARKING";

const LAYER_GROUPS = [
  { id: "runway", label: "Runways" },
  { id: "taxiway", label: "Taxiways" },
  { id: "apron", label: "Aprons" },
  { id: "terminal", label: "Terminals" },
  { id: "gate", label: "Gates / Stands" },
  { id: "holding_position", label: "Hold Points" },
] as const;

export const AirportGeometryEditor: React.FC = () => {
  const theme = useAtcStore((s) => s.theme);
  const selectedAirportRecord = useAtcStore((s) => s.selectedAirportRecord);
  const selectedAirportGeoJson = useAtcStore((s) => s.selectedAirportGeoJson);
  const resyncAirportOsmGeometry = useAtcStore((s) => s.resyncAirportOsmGeometry);
  const saveEditedAirportGeometry = useAtcStore((s) => s.saveEditedAirportGeometry);
  const launchRealAirportSimulation = useAtcStore((s) => s.launchRealAirportSimulation);
  const setAppMode = useAtcStore((s) => s.setAppMode);

  const airport = selectedAirportRecord;

  const initialCollection = useMemo<AirportGeoJsonCollection>(() => {
    if (selectedAirportGeoJson && selectedAirportGeoJson.features.length > 0) {
      return {
        ...selectedAirportGeoJson,
        features: selectedAirportGeoJson.features.map((f) => ({ ...f })),
      };
    }
    if (!airport) {
      return { type: "FeatureCollection", features: [] };
    }
    // Convert verified OurAirports runways into initial editable GeoJSON lines
    const rwyFeatures: AirportGeoJsonFeature[] = airport.runways
      .filter((r) => r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined)
      .map((r) => ({
        type: "Feature",
        id: `oa_${r.id}`,
        properties: {
          aeroway: "runway",
          ref: `${r.leIdent}/${r.heIdent}`,
          surface: r.surface,
          width: String(r.widthFt),
          source: "OurAirports",
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [r.leLon!, r.leLat!],
            [r.heLon!, r.heLat!],
          ],
        },
      }));
    return { type: "FeatureCollection", features: rwyFeatures };
  }, [airport?.icao, selectedAirportGeoJson]);

  const [features, setFeatures] = useState<AirportGeoJsonFeature[]>(initialCollection.features);
  const [tool, setTool] = useState<EditTool>("SELECT");
  const [draftPoints, setDraftPoints] = useState<Array<[number, number]>>([]);
  const [draftRef, setDraftRef] = useState("N1");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    runway: true,
    taxiway: true,
    apron: true,
    terminal: true,
    gate: true,
    holding_position: true,
  });
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [basemapVariant, setBasemapVariant] = useState<MapBasemapVariant>("satellite");

  useEffect(() => {
    setFeatures(initialCollection.features);
    setDraftPoints([]);
    setSelectedFeatureId(null);
  }, [initialCollection]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);
  const viewStateRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const toolRef = useRef<EditTool>(tool);
  toolRef.current = tool;
  const draftRefName = useRef<string>(draftRef);
  draftRefName.current = draftRef;

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId]
  );

  // Filtered GeoJSON for map preview
  const editorGeoJson = useMemo(() => {
    const visible = features.filter((f) => {
      const aeroway = String(f.properties.aeroway ?? "");
      if (aeroway === "parking_position" || aeroway === "gate") return visibleLayers.gate;
      if (aeroway in visibleLayers) return visibleLayers[aeroway];
      return true;
    });

    const draftFeats: AirportGeoJsonFeature[] = [];
    if (draftPoints.length >= 2) {
      draftFeats.push({
        type: "Feature",
        id: "__draft_line",
        properties: { aeroway: tool === "ADD_RUNWAY" ? "runway" : "taxiway", ref: draftRef },
        geometry: { type: "LineString", coordinates: draftPoints },
      });
    }
    draftPoints.forEach((pt, idx) => {
      draftFeats.push({
        type: "Feature",
        id: `__draft_pt_${idx}`,
        properties: { aeroway: "draft_vertex" },
        geometry: { type: "Point", coordinates: pt },
      });
    });

    return {
      type: "FeatureCollection" as const,
      features: [...visible, ...draftFeats],
    };
  }, [features, visibleLayers, draftPoints, tool, draftRef]);

  const latestEditorGeoJsonRef = useRef(editorGeoJson);
  latestEditorGeoJsonRef.current = editorGeoJson;

  useEffect(() => {
    if (!mapContainerRef.current || !airport) return;
    ensureMapLibreWorker();

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: buildKeylessMapStyle(theme, basemapVariant),
      center: viewStateRef.current?.center ?? [airport.lon, airport.lat],
      zoom: viewStateRef.current?.zoom ?? 13.6,
      attributionControl: false,
    });

    map.addControl(new NavigationControl(), "top-right");
    map.on("moveend", () => {
      const c = map.getCenter();
      viewStateRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    });
    map.on("error", () => {});

    map.on("load", () => {
      mapReadyRef.current = true;
      map.addSource("editor-source", {
        type: "geojson",
        data: latestEditorGeoJsonRef.current as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "ed-polygons",
        type: "fill",
        source: "editor-source",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": ["match", ["get", "aeroway"], "terminal", "#38bdf8", "apron", "#64748b", "#475569"],
          "fill-opacity": 0.42,
        },
      });

      map.addLayer({
        id: "ed-taxiways",
        type: "line",
        source: "editor-source",
        filter: ["==", ["get", "aeroway"], "taxiway"],
        paint: {
          "line-color": "#eab308",
          "line-width": 4,
        },
      });

      map.addLayer({
        id: "ed-runways",
        type: "line",
        source: "editor-source",
        filter: ["==", ["get", "aeroway"], "runway"],
        paint: {
          "line-color": theme === "dark" ? "#f8fafc" : "#1e293b",
          "line-width": 8,
        },
      });

      map.addLayer({
        id: "ed-points",
        type: "circle",
        source: "editor-source",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "match",
            ["get", "aeroway"],
            "draft_vertex",
            6,
            "holding_position",
            6.5,
            7,
          ],
          "circle-color": [
            "match",
            ["get", "aeroway"],
            "holding_position",
            "#ef4444",
            "gate",
            "#0ea5e9",
            "parking_position",
            "#10b981",
            "draft_vertex",
            "#f97316",
            "#8b5cf6",
          ],
          "circle-stroke-width": 1.8,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "ed-labels",
        type: "symbol",
        source: "editor-source",
        layout: {
          "text-field": ["coalesce", ["get", "ref"], ["get", "name"], ""],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
        },
        paint: {
          "text-color": theme === "dark" ? "#f8fafc" : "#0f172a",
          "text-halo-color": theme === "dark" ? "#060b12" : "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      map.on("click", (e: MapLayerMouseEvent) => {
        const curTool = toolRef.current;
        const coord: [number, number] = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];

        if (curTool === "SELECT") {
          const hit = map.queryRenderedFeatures(e.point, {
            layers: ["ed-points", "ed-taxiways", "ed-runways", "ed-polygons"],
          });
          if (hit.length > 0 && hit[0].id !== undefined) {
            setSelectedFeatureId(String(hit[0].id));
          } else {
            const propRef = hit[0]?.properties?.ref;
            if (propRef) {
              setFeatures((prev) => {
                const match = prev.find((f) => String(f.properties.ref ?? "") === String(propRef));
                if (match?.id) setSelectedFeatureId(match.id);
                return prev;
              });
            }
          }
          return;
        }

        if (curTool === "ADD_TAXIWAY" || curTool === "ADD_RUNWAY") {
          setDraftPoints((prev) => [...prev, coord]);
          return;
        }

        const aeroway =
          curTool === "ADD_GATE"
            ? "gate"
            : curTool === "ADD_HOLD_POINT"
            ? "holding_position"
            : "parking_position";

        const id = `manual_${aeroway}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const newFeat: AirportGeoJsonFeature = {
          type: "Feature",
          id,
          properties: {
            aeroway,
            ref: draftRefName.current.trim() || aeroway.slice(0, 3).toUpperCase(),
            name: draftRefName.current.trim() || undefined,
            source: "ManualEditor",
          },
          geometry: {
            type: "Point",
            coordinates: coord,
          },
        };
        setFeatures((prev) => [...prev, newFeat]);
        setSelectedFeatureId(id);
      });
    });

    mapRef.current = map;
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [airport?.icao, theme, basemapVariant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const src = map.getSource("editor-source") as GeoJSONSource | undefined;
    if (src) src.setData(editorGeoJson as GeoJSON.FeatureCollection);
  }, [editorGeoJson]);

  const commitDraftLine = () => {
    if (draftPoints.length < 2) return;
    const aeroway = tool === "ADD_RUNWAY" ? "runway" : "taxiway";
    const id = `manual_${aeroway}_${Date.now().toString(36)}`;
    const feat: AirportGeoJsonFeature = {
      type: "Feature",
      id,
      properties: {
        aeroway,
        ref: draftRef.trim() || (aeroway === "runway" ? "09/27" : "N1"),
        source: "ManualEditor",
      },
      geometry: {
        type: "LineString",
        coordinates: draftPoints,
      },
    };
    setFeatures((prev) => [...prev, feat]);
    setSelectedFeatureId(id);
    setDraftPoints([]);
    setTool("SELECT");
  };

  const handleDeleteSelected = () => {
    if (!selectedFeatureId) return;
    setFeatures((prev) => prev.filter((f) => f.id !== selectedFeatureId));
    setSelectedFeatureId(null);
  };

  const handleRenameSelected = (nextRef: string) => {
    if (!selectedFeatureId) return;
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === selectedFeatureId
          ? { ...f, properties: { ...f.properties, ref: nextRef, source: "ManualEditor" } }
          : f
      )
    );
  };

  const handleSave = async () => {
    if (!airport) return;
    setSaving(true);
    setSaveMessage(null);
    const collection: AirportGeoJsonCollection = {
      type: "FeatureCollection",
      features,
    };
    const res = await saveEditedAirportGeometry(airport.icao, collection);
    setSaving(false);
    setSaveMessage({
      ok: res.ok,
      text: res.error
        ? `Saved locally (${res.error})`
        : `Saved ${features.length} features for ${airport.icao} as "Manually edited".`,
    });
  };

  const handleResyncOsm = async () => {
    if (!airport) return;
    setResyncing(true);
    setSaveMessage(null);
    const res = await resyncAirportOsmGeometry(airport.icao);
    setResyncing(false);
    setSaveMessage({
      ok: res.ok,
      text: res.ok
        ? `Synchronized ${res.featureCount} real OpenStreetMap features for ${airport.icao}.`
        : res.error ?? `Failed to refresh OSM geometry for ${airport.icao}.`,
    });
  };

  if (!airport) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--atc-bg)] text-[var(--atc-text)] gap-3">
        <p className="text-sm">Select an airport on the Global Map first to edit its geometry.</p>
        <button
          onClick={() => setAppMode("GLOBAL_MAP")}
          className="px-4 py-2 rounded bg-[var(--atc-accent)] text-stone-950 font-semibold text-xs"
        >
          Return to Global Map
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--atc-bg)] text-[var(--atc-text)] overflow-hidden">
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
            <div className="font-bold text-sm flex items-center gap-2">
              <span className="font-mono">{airport.icao}</span>
              <span>Airport Geometry Editor</span>
              <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)]">
                {airport.dataQuality}
              </span>
            </div>
            <p className="text-[11px] text-[var(--atc-muted)] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-[var(--atc-amber)]" />
              Simulation & community geometry editor — unverified OSM geometry is not certified aviation data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded p-0.5 text-[10px] font-mono">
            {(["satellite", "chart"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setBasemapVariant(v)}
                className={`px-2 py-1 rounded uppercase font-bold ${
                  basemapVariant === v
                    ? "bg-[var(--atc-accent-soft)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                    : "text-[var(--atc-muted)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => void handleResyncOsm()}
            disabled={resyncing}
            title="Re-fetch real OpenStreetMap aeroway layout (taxiways, aprons, terminals, stands)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resyncing ? "animate-spin" : ""}`} />
            {resyncing ? "Syncing OSM..." : "Re-sync Real OSM"}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)]"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save Corrections"}
          </button>
          <button
            onClick={() => void launchRealAirportSimulation(airport)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-[var(--atc-accent)] text-stone-950"
          >
            <Plane className="w-3.5 h-3.5" />
            Test in Simulation
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Left Tool & Layers Panel */}
        <aside className="w-72 shrink-0 border-r border-[var(--atc-border)] bg-[var(--atc-panel)] p-3 flex flex-col gap-3 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--atc-muted)] mb-1.5">
              Drawing Tools
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: "SELECT", label: "Select / Inspect" },
                  { id: "ADD_TAXIWAY", label: "+ Taxiway Path" },
                  { id: "ADD_RUNWAY", label: "+ Runway Line" },
                  { id: "ADD_GATE", label: "+ Gate Point" },
                  { id: "ADD_PARKING", label: "+ Parking Stand" },
                  { id: "ADD_HOLD_POINT", label: "+ Hold Position" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTool(t.id);
                    setDraftPoints([]);
                    if (t.id === "ADD_TAXIWAY") setDraftRef("TWY_A");
                    else if (t.id === "ADD_RUNWAY") setDraftRef("09/27");
                    else if (t.id === "ADD_GATE") setDraftRef("G1");
                    else if (t.id === "ADD_HOLD_POINT") setDraftRef("HP1");
                    else if (t.id === "ADD_PARKING") setDraftRef("P1");
                  }}
                  className={`px-2 py-1.5 text-[11px] font-medium rounded border text-left ${
                    tool === t.id
                      ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent-border)] text-[var(--atc-accent-text)] font-bold"
                      : "bg-[var(--atc-surface)] border-[var(--atc-border)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Draft Label / Line Commit */}
          {tool !== "SELECT" && (
            <div className="p-2.5 rounded border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] space-y-2 text-xs">
              <div>
                <label className="text-[10px] uppercase font-semibold block mb-1">
                  New Feature Identifier (ref)
                </label>
                <input
                  type="text"
                  value={draftRef}
                  onChange={(e) => setDraftRef(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] font-mono text-xs"
                />
              </div>
              {tool === "ADD_TAXIWAY" || tool === "ADD_RUNWAY" ? (
                <>
                  <p className="text-[11px] text-[var(--atc-text-secondary)]">
                    Click vertices on the map ({draftPoints.length} placed).
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={commitDraftLine}
                      disabled={draftPoints.length < 2}
                      className="flex-1 py-1 px-2 rounded bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] font-semibold disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3 inline mr-1" />
                      Finish Line
                    </button>
                    <button
                      onClick={() => setDraftPoints([])}
                      className="py-1 px-2 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)]"
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-[var(--atc-text-secondary)] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  Click anywhere on the map to place point.
                </p>
              )}
            </div>
          )}

          {/* Layer Toggles */}
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--atc-muted)] mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              Infrastructure Layers
            </h3>
            <div className="space-y-1">
              {LAYER_GROUPS.map((lg) => {
                const on = visibleLayers[lg.id];
                return (
                  <button
                    key={lg.id}
                    onClick={() => setVisibleLayers((prev) => ({ ...prev, [lg.id]: !prev[lg.id] }))}
                    className="w-full px-2.5 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between text-xs"
                  >
                    <span>{lg.label}</span>
                    {on ? (
                      <Eye className="w-3.5 h-3.5 text-[var(--atc-emerald)]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[var(--atc-muted)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {saveMessage && (
            <div
              className={`p-2 rounded border text-[11px] flex items-start gap-1.5 ${
                saveMessage.ok
                  ? "bg-[var(--atc-emerald-bg)] border-[var(--atc-emerald-border)] text-[var(--atc-emerald)]"
                  : "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveMessage.text}</span>
            </div>
          )}

          {/* Selected Feature Inspector & Feature List */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--atc-muted)] mb-1">
              Features ({features.length})
            </h3>
            {selectedFeature && (
              <div className="mb-2 p-2 rounded border border-[var(--atc-accent-border)] bg-[var(--atc-accent-soft)] space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold uppercase">{String(selectedFeature.properties.aeroway ?? "")}</span>
                  <button
                    onClick={handleDeleteSelected}
                    className="p-1 rounded bg-[var(--atc-red-bg)] text-[var(--atc-red)] border border-[var(--atc-red-border)]"
                    title="Delete feature"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={String(selectedFeature.properties.ref ?? "")}
                  onChange={(e) => handleRenameSelected(e.target.value)}
                  placeholder="Ref / Label"
                  className="w-full px-2 py-1 rounded border border-[var(--atc-border)] bg-[var(--atc-surface)] font-mono text-xs"
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {features.map((f, idx) => (
                <button
                  key={f.id ?? `feat_${idx}`}
                  onClick={() => f.id && setSelectedFeatureId(f.id)}
                  className={`w-full text-left px-2 py-1 rounded border text-[11px] flex items-center justify-between ${
                    selectedFeatureId === f.id
                      ? "bg-[var(--atc-accent-soft)] border-[var(--atc-accent-border)] font-semibold"
                      : "bg-[var(--atc-surface)] border-[var(--atc-border)]"
                  }`}
                >
                  <span className="truncate">{String(f.properties.aeroway ?? "")}</span>
                  <span className="font-mono text-[10px] text-[var(--atc-muted)]">
                    {String(f.properties.ref ?? f.properties.name ?? (f.id ? f.id.slice(-5) : "feat"))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* MapLibre Geometry Canvas */}
        <main className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />
        </main>
      </div>
    </div>
  );
};
