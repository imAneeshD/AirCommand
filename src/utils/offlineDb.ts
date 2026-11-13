import compactOfflineSeed from "../data/worldAirportsSeed.json" with { type: "json" };
import type {
  AirportCategory,
  AirportDataQuality,
  AirportGeoJsonCollection,
  AirportRecord,
  RawRunwayMetadata,
} from "../types/atc.ts";

const DB_NAME = "aircommand_offline_v1";
const DB_VERSION = 1;
const STORE_AIRPORTS = "airports";
const STORE_GEOMETRIES = "geometries";
const STORE_META = "meta";

export interface CachedGeometryEntry {
  icao: string;
  geojson: AirportGeoJsonCollection;
  dataQuality: AirportDataQuality;
  updatedAt: string;
  pendingSync: boolean;
}

class OfflineDataService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryAirports = new Map<string, AirportRecord>();
  private memoryGeometries = new Map<string, CachedGeometryEntry>();

  constructor() {
    for (const raw of compactOfflineSeed as unknown as AirportRecord[]) {
      this.memoryAirports.set(raw.icao, raw);
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_AIRPORTS)) {
            db.createObjectStore(STORE_AIRPORTS, { keyPath: "icao" });
          }
          if (!db.objectStoreNames.contains(STORE_GEOMETRIES)) {
            db.createObjectStore(STORE_GEOMETRIES, { keyPath: "icao" });
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  async cacheAirports(airports: AirportRecord[]): Promise<void> {
    for (const a of airports) {
      this.memoryAirports.set(a.icao, a);
    }
    const db = await this.openDb();
    if (!db || airports.length === 0) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_AIRPORTS, "readwrite");
        const store = tx.objectStore(STORE_AIRPORTS);
        for (const a of airports) {
          store.put(a);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getAllCachedAirports(): Promise<AirportRecord[]> {
    const db = await this.openDb();
    if (db) {
      const stored = await new Promise<AirportRecord[]>((resolve) => {
        try {
          const tx = db.transaction(STORE_AIRPORTS, "readonly");
          const req = tx.objectStore(STORE_AIRPORTS).getAll();
          req.onsuccess = () => resolve((req.result as AirportRecord[]) ?? []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
      for (const a of stored) {
        if (!this.memoryAirports.has(a.icao)) {
          this.memoryAirports.set(a.icao, a);
        } else {
          // Prefer cached record if it has updated dataQuality or geometry flags
          const existing = this.memoryAirports.get(a.icao)!;
          if (a.dataQuality === "Manually edited" || a.hasOsmGeometry) {
            this.memoryAirports.set(a.icao, a);
          } else {
            this.memoryAirports.set(a.icao, { ...existing, ...a });
          }
        }
      }
    }

    // Attempt once to hydrate the full static catalog JSON from /data/worldAirportsSeed.json
    if (this.memoryAirports.size < 300 && typeof fetch !== "undefined") {
      try {
        const res = await fetch("/data/worldAirportsSeed.json");
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 0) {
            const full = JSON.parse(text) as AirportRecord[];
            if (Array.isArray(full) && full.length > 0) {
              for (const item of full) {
                if (!this.memoryAirports.has(item.icao)) {
                  this.memoryAirports.set(item.icao, item);
                }
              }
              void this.cacheAirports(full);
            }
          }
        }
      } catch {
        // Offline or unreachable — keep compact bundled seed + IDB cache cleanly
      }
    }

    return Array.from(this.memoryAirports.values()).sort((a, b) => {
      if (a.isoCountry === "IN" && b.isoCountry !== "IN") return -1;
      if (a.isoCountry !== "IN" && b.isoCountry === "IN") return 1;
      return (b.runwayCount ?? b.runways.length) - (a.runwayCount ?? a.runways.length) || a.icao.localeCompare(b.icao);
    });
  }

  async searchOfflineAirports(params: {
    q?: string;
    country?: string;
    category?: AirportCategory | "All";
    limit?: number;
  }): Promise<AirportRecord[]> {
    const all = await this.getAllCachedAirports();
    const q = (params.q ?? "").trim().toUpperCase();
    const country = (params.country ?? "").trim().toUpperCase();
    const cat = params.category && params.category !== "All" ? params.category : null;
    const limit = params.limit ?? 200;

    const filtered = all.filter((a) => {
      if (cat && a.category !== cat) return false;
      if (country && a.isoCountry.toUpperCase() !== country && !a.country.toUpperCase().includes(country)) {
        return false;
      }
      if (!q) return true;
      const matchesGoaAlias = q === "VAGO" && (a.icao === "VOGA" || a.icao === "VOGO");
      return (
        matchesGoaAlias ||
        a.icao.toUpperCase().includes(q) ||
        (a.iata ?? "").toUpperCase().includes(q) ||
        a.name.toUpperCase().includes(q) ||
        a.city.toUpperCase().includes(q) ||
        a.country.toUpperCase().includes(q)
      );
    });

    return filtered.slice(0, limit);
  }

  async cacheGeometry(entry: CachedGeometryEntry): Promise<void> {
    const icao = entry.icao.toUpperCase();
    this.memoryGeometries.set(icao, { ...entry, icao });
    const existing = this.memoryAirports.get(icao);
    if (existing) {
      this.memoryAirports.set(icao, {
        ...existing,
        dataQuality: entry.dataQuality,
        hasOsmGeometry: entry.geojson.features.length > 0,
        geoJson: entry.geojson,
      });
    }

    const db = await this.openDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([STORE_GEOMETRIES, STORE_AIRPORTS], "readwrite");
        tx.objectStore(STORE_GEOMETRIES).put({ ...entry, icao });
        if (existing) {
          tx.objectStore(STORE_AIRPORTS).put(this.memoryAirports.get(icao));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getCachedGeometry(icaoInput: string): Promise<CachedGeometryEntry | null> {
    const icao = icaoInput.toUpperCase();
    const mem = this.memoryGeometries.get(icao);
    if (mem) return mem;

    const db = await this.openDb();
    if (!db) return null;

    const entry = await new Promise<CachedGeometryEntry | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_GEOMETRIES, "readonly");
        const req = tx.objectStore(STORE_GEOMETRIES).get(icao);
        req.onsuccess = () => resolve((req.result as CachedGeometryEntry) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (entry) {
      this.memoryGeometries.set(icao, entry);
    }
    return entry;
  }

  async getPendingGeometrySyncs(): Promise<CachedGeometryEntry[]> {
    const db = await this.openDb();
    if (!db) {
      return Array.from(this.memoryGeometries.values()).filter((g) => g.pendingSync);
    }

    const all = await new Promise<CachedGeometryEntry[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_GEOMETRIES, "readonly");
        const req = tx.objectStore(STORE_GEOMETRIES).getAll();
        req.onsuccess = () => resolve((req.result as CachedGeometryEntry[]) ?? []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    return all.filter((g) => g.pendingSync);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_META, "readwrite");
        tx.objectStore(STORE_META).put({ key, value, updatedAt: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  getBundledFallbackAirport(icaoInput: string): AirportRecord | null {
    return this.memoryAirports.get(icaoInput.toUpperCase()) ?? null;
  }

  static hasCompleteRunways(runways: RawRunwayMetadata[]): boolean {
    return runways.some((r) => r.leLat !== undefined && r.heLat !== undefined);
  }
}

export const offlineDb = new OfflineDataService();
