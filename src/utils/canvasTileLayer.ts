import { localNmToLatLon } from "./geo.ts";

type TileVariant = "satellite" | "street" | "dark";

interface CachedTileEntry {
  img: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
}

const tileCache = new Map<string, CachedTileEntry>();
let pendingNotifyTimer: number | null = null;

function tileUrlFor(variant: TileVariant, z: number, x: number, y: number): string {
  if (variant === "satellite") {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
  if (variant === "dark") {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
  }
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
}

function latLonToMercatorFrac(latDeg: number, lonDeg: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lonDeg + 180) / 360) * n;
  const latRad = (Math.max(-85, Math.min(85, latDeg)) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function mercatorFracToLatLon(tx: number, ty: number, z: number): { lat: number; lon: number } {
  const n = 2 ** z;
  const lon = (tx / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

function getOrLoadTile(
  variant: TileVariant,
  z: number,
  x: number,
  y: number,
  onTileReady: () => void
): HTMLImageElement | null {
  const n = 2 ** z;
  const wrappedX = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;

  const key = `${variant}/${z}/${wrappedX}/${y}`;
  const existing = tileCache.get(key);
  if (existing) {
    return existing.loaded && !existing.failed ? existing.img : null;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  const entry: CachedTileEntry = { img, loaded: false, failed: false };
  tileCache.set(key, entry);

  // Evict oldest entries smoothly if cache grows large
  if (tileCache.size > 400) {
    const firstKey = tileCache.keys().next().value;
    if (firstKey) tileCache.delete(firstKey);
  }

  img.onload = () => {
    entry.loaded = true;
    if (pendingNotifyTimer !== null) return;
    pendingNotifyTimer = window.setTimeout(() => {
      pendingNotifyTimer = null;
      onTileReady();
    }, 35);
  };
  img.onerror = () => {
    entry.failed = true;
  };
  img.src = tileUrlFor(variant, z, wrappedX, y);
  return null;
}

/**
 * Draws georeferenced real-world satellite / map tiles onto an HTML5 Canvas
 * aligned pixel-for-pixel with AirCommand's local NM airport coordinate system.
 */
export function drawGeoreferencedTilesToCanvas(opts: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  airportLat: number;
  airportLon: number;
  centerX: number;
  centerY: number;
  pixelsPerNm: number;
  rotRad: number;
  variant: TileVariant;
  opacity: number;
  onTileReady: () => void;
}): void {
  const {
    ctx,
    width,
    height,
    airportLat,
    airportLon,
    centerX,
    centerY,
    pixelsPerNm,
    rotRad,
    variant,
    opacity,
    onTileReady,
  } = opts;

  if (typeof Image === "undefined") return;

  // Approximate pixels-per-degree at airport latitude and pick crisp WebMercator zoom
  const cosLat = Math.max(0.2, Math.cos((airportLat * Math.PI) / 180));
  const pxPerDegLon = pixelsPerNm * 60 * cosLat;
  const rawZoom = Math.log2((pxPerDegLon * 360) / 256);
  const z = Math.max(7, Math.min(variant === "dark" ? 15 : 17, Math.round(rawZoom)));

  // Convert viewport corners to lat/lon to span visible tiles cleanly even when rotated
  const screenToWorld = (sx: number, sy: number) => {
    const ux = (sx - width / 2) / pixelsPerNm;
    const uy = (sy - height / 2) / pixelsPerNm;
    if (rotRad === 0) return { x: centerX + ux, y: centerY - uy };
    const c = Math.cos(rotRad);
    const s = Math.sin(rotRad);
    return {
      x: centerX + (ux * c + uy * s),
      y: centerY - (-ux * s + uy * c),
    };
  };

  const corners = [
    screenToWorld(0, 0),
    screenToWorld(width, 0),
    screenToWorld(width, height),
    screenToWorld(0, height),
  ];

  let minTx = Infinity;
  let maxTx = -Infinity;
  let minTy = Infinity;
  let maxTy = -Infinity;

  for (const wPt of corners) {
    const ll = localNmToLatLon(wPt.x, wPt.y, airportLat, airportLon);
    const tf = latLonToMercatorFrac(ll.lat, ll.lon, z);
    minTx = Math.min(minTx, tf.x);
    maxTx = Math.max(maxTx, tf.x);
    minTy = Math.min(minTy, tf.y);
    maxTy = Math.max(maxTy, tf.y);
  }

  const x0 = Math.floor(minTx);
  const x1 = Math.floor(maxTx);
  const y0 = Math.floor(minTy);
  const y1 = Math.floor(maxTy);

  // Guard against extreme zoom-out over hundreds of tiles
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 48) return;

  const nmPerDegLat = 60;
  const worldToScreen = (wx: number, wy: number): [number, number] => {
    const dx = wx - centerX;
    const dy = -(wy - centerY);
    if (rotRad === 0) {
      return [width / 2 + dx * pixelsPerNm, height / 2 + dy * pixelsPerNm];
    }
    const c = Math.cos(rotRad);
    const s = Math.sin(rotRad);
    return [width / 2 + (dx * c - dy * s) * pixelsPerNm, height / 2 + (dx * s + dy * c) * pixelsPerNm];
  };

  ctx.save();
  ctx.globalAlpha = opacity;

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const img = getOrLoadTile(variant, z, tx, ty, onTileReady);
      if (!img) continue;

      const tl = mercatorFracToLatLon(tx, ty, z);
      const br = mercatorFracToLatLon(tx + 1, ty + 1, z);
      const tlNm = {
        x: (tl.lon - airportLon) * nmPerDegLat * cosLat,
        y: (tl.lat - airportLat) * nmPerDegLat,
      };
      const brNm = {
        x: (br.lon - airportLon) * nmPerDegLat * cosLat,
        y: (br.lat - airportLat) * nmPerDegLat,
      };

      const [sx0, sy0] = worldToScreen(tlNm.x, tlNm.y);
      const [sx1, sy1] = worldToScreen(brNm.x, tlNm.y);
      const [sx2, sy2] = worldToScreen(tlNm.x, brNm.y);

      const tileW = Math.hypot(sx1 - sx0, sy1 - sy0);
      const tileH = Math.hypot(sx2 - sx0, sy2 - sy0);
      const angle = Math.atan2(sy1 - sy0, sx1 - sx0);

      ctx.save();
      ctx.translate(sx0, sy0);
      ctx.rotate(angle);
      // Slight 1px overlap eliminates subpixel tile seams cleanly
      ctx.drawImage(img, -0.5, -0.5, tileW + 1, tileH + 1);
      ctx.restore();
    }
  }

  ctx.restore();
}
