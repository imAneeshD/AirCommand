import type { LiveAdsbTrack } from "../../src/types/atc.ts";

export interface OpenSkyAircraftMetadata {
  found: boolean;
  icao24: string;
  registration: string | null;
  manufacturer: string | null;
  model: string | null;
  typecode: string | null;
  operator: string | null;
  operatorIcao: string | null;
}

interface TokenCache {
  accessToken: string;
  expiresAtMs: number;
}

interface MetaCacheEntry {
  expiresAtMs: number;
  meta: OpenSkyAircraftMetadata;
}

const META_HIT_TTL_MS = 24 * 60 * 60 * 1000;
const META_MISS_TTL_MS = 30 * 60 * 1000;
const META_TIMEOUT_MS = 2500;
const OPENSKY_TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let cachedToken: TokenCache | null = null;

export async function getOpenSkyHeaders(
  fetchFn: typeof fetch = fetch
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "User-Agent": "AirCommand-ATC-Sim/2.0",
    Accept: "application/json",
  };

  const clientId = process.env.OPENSKY_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return headers;
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 15_000) {
    headers.Authorization = `Bearer ${cachedToken.accessToken}`;
    return headers;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetchFn(OPENSKY_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (json.access_token) {
        const ttlSec = Math.max(60, Number(json.expires_in ?? 1800));
        cachedToken = {
          accessToken: json.access_token,
          expiresAtMs: now + ttlSec * 1000,
        };
        headers.Authorization = `Bearer ${json.access_token}`;
      }
    }
  } catch {
    // Fall back gracefully to anonymous OpenSky request
  }

  return headers;
}

function cleanStr(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class OpenSkyMetadataService {
  private readonly cache = new Map<string, MetaCacheEntry>();
  private readonly inflight = new Map<string, Promise<OpenSkyAircraftMetadata>>();
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  async lookupByIcao24(rawIcao24: string): Promise<OpenSkyAircraftMetadata> {
    const icao24 = rawIcao24.trim().toLowerCase();
    if (!/^[a-f0-9]{6}$/.test(icao24)) {
      return {
        found: false,
        icao24,
        registration: null,
        manufacturer: null,
        model: null,
        typecode: null,
        operator: null,
        operatorIcao: null,
      };
    }

    const now = Date.now();
    const cached = this.cache.get(icao24);
    if (cached && cached.expiresAtMs > now) {
      return cached.meta;
    }

    let pending = this.inflight.get(icao24);
    if (!pending) {
      pending = this.fetchMetadata(icao24).finally(() => {
        this.inflight.delete(icao24);
      });
      this.inflight.set(icao24, pending);
    }
    return pending;
  }

  private async fetchMetadata(icao24: string): Promise<OpenSkyAircraftMetadata> {
    const empty: OpenSkyAircraftMetadata = {
      found: false,
      icao24,
      registration: null,
      manufacturer: null,
      model: null,
      typecode: null,
      operator: null,
      operatorIcao: null,
    };

    // 1. Primary: OpenSky aircraft metadata registry
    try {
      const headers = await getOpenSkyHeaders(this.fetchFn);
      const url = `https://opensky-network.org/api/metadata/aircraft/icao/${encodeURIComponent(icao24)}`;
      const res = await this.fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const registration = cleanStr(data.registration);
        const manufacturer = cleanStr(data.manufacturerName) ?? cleanStr(data.manufacturerIcao);
        const model = cleanStr(data.model);
        const typecode = cleanStr(data.typecode);
        const operator =
          cleanStr(data.operator) ?? cleanStr(data.operatorCallsign) ?? cleanStr(data.owner);
        const operatorIcao = cleanStr(data.operatorIcao);

        if (registration || model || typecode || operator) {
          const meta: OpenSkyAircraftMetadata = {
            found: true,
            icao24,
            registration,
            manufacturer,
            model,
            typecode,
            operator,
            operatorIcao,
          };
          this.cache.set(icao24, { expiresAtMs: Date.now() + META_HIT_TTL_MS, meta });
          return meta;
        }
      }
    } catch {
      // Fall through to backup open ADS-B aircraft registry APIs
    }

    // 2. Fallback: ADSBDB public aircraft lookup (https://api.adsbdb.com/v0/aircraft/{hex})
    try {
      const res = await this.fetchFn(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(icao24)}`, {
        headers: { "User-Agent": "AirCommand-ATC-Sim/2.0", Accept: "application/json" },
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          response?: { aircraft?: Record<string, unknown> };
        };
        const ac = json.response?.aircraft;
        if (ac) {
          const registration = cleanStr(ac.registration);
          const manufacturer = cleanStr(ac.manufacturer);
          const model = cleanStr(ac.type);
          const typecode = cleanStr(ac.icao_type);
          const operator = cleanStr(ac.registered_owner);
          const operatorIcao = cleanStr(ac.registered_owner_operator_flag_code);
          if (registration || model || typecode || operator) {
            const meta: OpenSkyAircraftMetadata = {
              found: true,
              icao24,
              registration,
              manufacturer,
              model,
              typecode,
              operator,
              operatorIcao,
            };
            this.cache.set(icao24, { expiresAtMs: Date.now() + META_HIT_TTL_MS, meta });
            return meta;
          }
        }
      }
    } catch {
      // Fall through to HexDB
    }

    // 3. Fallback: HexDB public aircraft lookup (https://hexdb.io/api/v1/aircraft/{hex})
    try {
      const res = await this.fetchFn(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(icao24)}`, {
        headers: { "User-Agent": "AirCommand-ATC-Sim/2.0", Accept: "application/json" },
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const registration = cleanStr(data.registration) ?? cleanStr(data.Registration);
        const manufacturer = cleanStr(data.manufacturer) ?? cleanStr(data.Manufacturer);
        const model = cleanStr(data.type) ?? cleanStr(data.Type);
        const typecode = cleanStr(data.icao_type_code) ?? cleanStr(data.ICAOTypeCode);
        const operator = cleanStr(data.registered_owner) ?? cleanStr(data.RegisteredOwners);
        const operatorIcao = cleanStr(data.operator_flag_code) ?? cleanStr(data.OperatorFlagCode);
        if (registration || model || typecode || operator) {
          const meta: OpenSkyAircraftMetadata = {
            found: true,
            icao24,
            registration,
            manufacturer,
            model,
            typecode,
            operator,
            operatorIcao,
          };
          this.cache.set(icao24, { expiresAtMs: Date.now() + META_HIT_TTL_MS, meta });
          return meta;
        }
      }
    } catch {
      // Fall through to empty miss
    }

    this.cache.set(icao24, { expiresAtMs: Date.now() + META_MISS_TTL_MS, meta: empty });
    return empty;
  }

  async enrichTracks(tracks: LiveAdsbTrack[], maxNetworkLookups = 10): Promise<LiveAdsbTrack[]> {
    if (tracks.length === 0) return tracks;

    const now = Date.now();
    const toFetch: string[] = [];
    for (const t of tracks) {
      const key = t.icao24.trim().toLowerCase();
      if (!/^[a-f0-9]{6}$/.test(key)) continue;
      const cached = this.cache.get(key);
      if (cached && cached.expiresAtMs > now) continue;
      if (toFetch.length < maxNetworkLookups) {
        toFetch.push(key);
      }
    }

    if (toFetch.length > 0) {
      await Promise.race([
        Promise.allSettled(toFetch.map((hex) => this.lookupByIcao24(hex))),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    }

    return tracks.map((t) => {
      const cached = this.cache.get(t.icao24.trim().toLowerCase())?.meta;
      if (!cached || !cached.found) return t;
      return {
        ...t,
        registration: t.registration ?? cached.registration,
        aircraftType: t.aircraftType ?? cached.typecode,
        manufacturer: t.manufacturer ?? cached.manufacturer,
        model: t.model ?? cached.model,
        operator: t.operator ?? cached.operator,
      };
    });
  }
}
