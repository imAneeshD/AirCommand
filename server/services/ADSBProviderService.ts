import type { LiveAdsbTrack, LiveTrafficSnapshot } from "../../src/types/atc.ts";
import { getOpenSkyHeaders, OpenSkyMetadataService } from "./OpenSkyMetadataService.ts";

export interface ADSBProvider {
  readonly name: string;
  fetchRegion(bounds: {
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
  }): Promise<LiveAdsbTrack[]>;
}

/**
 * OpenSky Network anonymous REST ADS-B provider (/api/states/all).
 * Never synthesizes missing fields; unavailable metadata remains null.
 */
export class OpenSkyProvider implements ADSBProvider {
  readonly name = "OpenSky Network";

  async fetchRegion(bounds: {
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
  }): Promise<LiveAdsbTrack[]> {
    const url = `https://opensky-network.org/api/states/all?lamin=${bounds.lamin.toFixed(2)}&lomin=${bounds.lomin.toFixed(2)}&lamax=${bounds.lamax.toFixed(2)}&lomax=${bounds.lomax.toFixed(2)}`;
    const headers = await getOpenSkyHeaders();
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(9000),
    });

    if (res.status === 429) {
      const err = new Error("OpenSky rate limit (429)");
      (err as { status?: number }).status = 429;
      throw err;
    }
    if (!res.ok) {
      throw new Error(`OpenSky HTTP ${res.status}`);
    }

    const raw = await res.text();
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    const json = JSON.parse(raw) as {
      time?: number;
      states?: Array<
        [
          string,
          string | null,
          string,
          number | null,
          number,
          number | null,
          number | null,
          number | null,
          boolean,
          number | null,
          number | null,
          number | null,
          number[] | null,
          number | null,
          string | null,
          boolean,
          number
        ]
      >;
    };

    const states = json.states ?? [];
    const nowMs = Date.now();
    const out: LiveAdsbTrack[] = [];

    for (const s of states) {
      const icao24 = s[0];
      const lat = s[6];
      const lon = s[5];
      if (!icao24 || lat === null || lon === null) continue;

      const lastContactMs = (s[4] ?? json.time ?? Math.floor(nowMs / 1000)) * 1000;
      const baroAltM = s[7];
      const geoAltM = s[13];
      const velocityMs = s[9];
      const trackDeg = s[10];
      const vertRateMs = s[11];
      const callsignRaw = s[1] ? s[1].trim() : null;

      out.push({
        readonly: true,
        icao24,
        callsign: callsignRaw && callsignRaw.length > 0 ? callsignRaw : null,
        registration: null, // Not provided in OpenSky /states/all anonymous feed
        aircraftType: null, // Not provided in OpenSky /states/all anonymous feed
        originCountry: s[2] || null,
        lat,
        lon,
        baroAltFt: baroAltM !== null ? Math.round(baroAltM * 3.28084) : null,
        geoAltFt: geoAltM !== null ? Math.round(geoAltM * 3.28084) : null,
        groundSpeedKts: velocityMs !== null ? Math.round(velocityMs * 1.94384) : null,
        trackDeg: trackDeg !== null ? Math.round(trackDeg) : null,
        verticalRateFpm: vertRateMs !== null ? Math.round(vertRateMs * 196.85) : null,
        onGround: Boolean(s[8]),
        lastUpdatedMs: lastContactMs,
        stale: nowMs - lastContactMs > 45_000,
        trail: [],
      });
    }

    return out;
  }
}

interface CacheEntry {
  snapshot: LiveTrafficSnapshot;
  expiresAtMs: number;
}

export class ADSBProviderService {
  private provider: ADSBProvider;
  private metadataService: OpenSkyMetadataService;
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<LiveTrafficSnapshot>>();
  private trackTrails = new Map<string, Array<{ lat: number; lon: number; altFt: number | null; ts: number }>>();
  private backoffUntilMs = 0;
  private cacheTtlMs = 12_000;
  private staleThresholdMs = 45_000;

  constructor(
    provider: ADSBProvider = new OpenSkyProvider(),
    metadataService: OpenSkyMetadataService = new OpenSkyMetadataService()
  ) {
    this.provider = provider;
    this.metadataService = metadataService;
  }

  private quantizeKey(lat: number, lon: number, radiusDeg: number): string {
    const qLat = Math.round(lat * 4) / 4;
    const qLon = Math.round(lon * 4) / 4;
    const qRad = Math.max(0.5, Math.min(3.5, Math.round(radiusDeg * 2) / 2));
    return `${qLat}_${qLon}_${qRad}`;
  }

  async getLiveTraffic(
    lat: number,
    lon: number,
    radiusDeg = 1.5
  ): Promise<LiveTrafficSnapshot> {
    const key = this.quantizeKey(lat, lon, radiusDeg);
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && now < cached.expiresAtMs) {
      return {
        ...cached.snapshot,
        cached: true,
        tracks: cached.snapshot.tracks.map((t) => ({
          ...t,
          stale: now - t.lastUpdatedMs > this.staleThresholdMs,
        })),
      };
    }

    if (now < this.backoffUntilMs) {
      if (cached) {
        return {
          ...cached.snapshot,
          cached: true,
          rateLimited: true,
          tracks: cached.snapshot.tracks.map((t) => ({
            ...t,
            stale: now - t.lastUpdatedMs > this.staleThresholdMs,
          })),
        };
      }
      return {
        provider: this.provider.name,
        fetchedAtMs: now,
        cached: false,
        rateLimited: true,
        staleThresholdMs: this.staleThresholdMs,
        error: "Provider rate-limit cooldown active. Please retry shortly.",
        tracks: [],
      };
    }

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = (async (): Promise<LiveTrafficSnapshot> => {
        const bounds = {
          lamin: Math.max(-85, lat - radiusDeg),
          lamax: Math.min(85, lat + radiusDeg),
          lomin: Math.max(-180, lon - radiusDeg),
          lomax: Math.min(180, lon + radiusDeg),
        };
        try {
          const rawTracks = await this.provider.fetchRegion(bounds);
          const tracks = await this.metadataService.enrichTracks(rawTracks, 10);
          const fetchTs = Date.now();

          for (const t of tracks) {
            const prevTrail = this.trackTrails.get(t.icao24) ?? [];
            const last = prevTrail[prevTrail.length - 1];
            if (!last || Math.hypot(last.lat - t.lat, last.lon - t.lon) > 0.002) {
              prevTrail.push({ lat: t.lat, lon: t.lon, altFt: t.baroAltFt, ts: t.lastUpdatedMs });
              if (prevTrail.length > 20) prevTrail.shift();
              this.trackTrails.set(t.icao24, prevTrail);
            }
            t.trail = [...prevTrail];
          }

          const snap: LiveTrafficSnapshot = {
            provider: this.provider.name,
            fetchedAtMs: fetchTs,
            cached: false,
            rateLimited: false,
            staleThresholdMs: this.staleThresholdMs,
            error: null,
            tracks,
          };
          this.cache.set(key, { snapshot: snap, expiresAtMs: fetchTs + this.cacheTtlMs });
          return snap;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : String(err);
          if (status === 429) {
            this.backoffUntilMs = Date.now() + 30_000;
          }
          if (cached) {
            return {
              ...cached.snapshot,
              cached: true,
              rateLimited: status === 429,
              error: msg,
              tracks: cached.snapshot.tracks.map((t) => ({
                ...t,
                stale: Date.now() - t.lastUpdatedMs > this.staleThresholdMs,
              })),
            };
          }
          return {
            provider: this.provider.name,
            fetchedAtMs: Date.now(),
            cached: false,
            rateLimited: status === 429,
            staleThresholdMs: this.staleThresholdMs,
            error: msg,
            tracks: [],
          };
        } finally {
          this.inflight.delete(key);
        }
      })();
      this.inflight.set(key, pending);
    }

    return pending;
  }
}
