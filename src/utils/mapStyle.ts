import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";

export type MapBasemapVariant = "chart" | "satellite";

let workerConfigured = false;

/**
 * Points MapLibre GL JS directly at a bundled same-origin ESM worker script
 * in /vendor/maplibre-gl-worker.mjs so Vite dev/prod builds never 404 on
 * pre-bundled worker chunk paths.
 */
export function ensureMapLibreWorker(): void {
  if (workerConfigured || typeof window === "undefined") return;
  try {
    setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
    workerConfigured = true;
  } catch {
    // Safe fallback if running in non-browser environment
  }
}

/**
 * Keyless MapLibre raster + glyphs style builder using Esri ArcGIS World basemaps
 * (World Street Map / Dark Gray Canvas / World Imagery) and OpenFreeMap fonts.
 * Never uses third-party API-keyed endpoints (such as CARTO) that return watermark tiles.
 */
export function buildKeylessMapStyle(
  theme: "light" | "dark",
  variant: MapBasemapVariant = "chart"
): StyleSpecification {
  if (variant === "satellite") {
    return {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        imagery: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
        },
        labels: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 18,
        },
      },
      layers: [
        {
          id: "bg",
          type: "background",
          paint: { "background-color": "#0b131e" },
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "imagery",
          paint: { "raster-opacity": 0.96 },
        },
        {
          id: "satellite-labels",
          type: "raster",
          source: "labels",
          paint: { "raster-opacity": 0.72 },
        },
      ],
    };
  }

  if (theme === "dark") {
    return {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        darkBase: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 16,
          attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors",
        },
        darkRef: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          maxzoom: 16,
        },
      },
      layers: [
        {
          id: "bg",
          type: "background",
          paint: { "background-color": "#07101c" },
        },
        {
          id: "basemap-layer",
          type: "raster",
          source: "darkBase",
          paint: { "raster-opacity": 0.95 },
        },
        {
          id: "basemap-labels",
          type: "raster",
          source: "darkRef",
          paint: { "raster-opacity": 0.85 },
        },
      ],
    };
  }

  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      streetBase: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: "© Esri, OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": "#ebe5d8" },
      },
      {
        id: "basemap-layer",
        type: "raster",
        source: "streetBase",
        paint: { "raster-opacity": 0.95 },
      },
    ],
  };
}
