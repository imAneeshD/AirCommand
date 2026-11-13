export interface AircraftPhotoQuery {
  icao24?: string;
  preferRegistration?: boolean;
  airline?: string;
  model?: string;
  typeCode?: string;
  registration?: string;
}

export interface AircraftPhotoResult {
  found: boolean;
  url?: string;
  fullUrl?: string;
  source?: string;
  photographer?: string;
  caption?: string;
  matchedBy?: "icao24_hex" | "registration" | "airline_model" | "model_only";
}

interface CacheEntry {
  expiresAt: number;
  result: AircraftPhotoResult;
}

interface WikimediaPage {
  title?: string;
  index?: number;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    mime?: string;
    width?: number;
    height?: number;
    extmetadata?: {
      Artist?: { value?: string };
      ImageDescription?: { value?: string };
    };
  }>;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3500;
const ACCEPTED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const REJECT_TITLE_RE = /(logo|icon|map|route|diagram|flag|emblem|seatmap|cabin|cockpit|galley|patch|badge|symbol)/i;
const REJECT_EXT_RE = /\.(svg|pdf|gif|tif|tiff|webm|ogv|ogg|mp4)(\?|$)/i;

function stripHtml(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAircraftModelFamily(model: string): string {
  const cleaned = model
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // e.g. "Boeing 737-800" -> "Boeing 737", "Airbus A320-200" -> "Airbus A320", "Embraer E190" -> "Embraer E190"
  return cleaned.replace(/(-\d{2,3}[A-Z]*|ER|LR|F)$/i, "").trim();
}

function cleanAirlineName(airline: string): string {
  return airline
    .replace(/\b(Cargo|Express|Shuttle)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchQueries(query: AircraftPhotoQuery): Array<{
  search: string;
  matchedBy: "airline_model" | "model_only";
}> {
  const modelFull = (query.model ?? "").trim() || (query.typeCode ?? "").trim();
  if (!modelFull) return [];
  const modelFamily = normalizeAircraftModelFamily(modelFull);
  const airlineRaw = (query.airline ?? "").trim();
  const airlineClean = cleanAirlineName(airlineRaw);
  const queries: Array<{ search: string; matchedBy: "airline_model" | "model_only" }> = [];

  const hasAirline =
    airlineClean.length >= 3 &&
    !/^(unknown|private|general aviation|generic)$/i.test(airlineClean);

  if (hasAirline) {
    queries.push({
      search: `"${airlineClean}" "${modelFamily || modelFull}" filetype:bitmap`,
      matchedBy: "airline_model",
    });
    if (airlineClean !== airlineRaw) {
      queries.push({
        search: `"${airlineRaw}" ${modelFamily || modelFull} filetype:bitmap`,
        matchedBy: "airline_model",
      });
    }
  }

  queries.push({
    search: `"${modelFull}" aircraft filetype:bitmap`,
    matchedBy: "model_only",
  });
  if (modelFamily && modelFamily !== modelFull) {
    queries.push({
      search: `"${modelFamily}" airliner filetype:bitmap`,
      matchedBy: "model_only",
    });
  }

  return queries;
}

function scoreCandidate(
  page: WikimediaPage,
  airlineTokens: string[],
  modelTokens: string[]
): number {
  const title = page.title ?? "";
  const info = page.imageinfo?.[0];
  if (!info) return -1;

  const url = info.thumburl ?? info.url ?? "";
  const mime = (info.mime ?? "").toLowerCase();
  if (!url) return -1;
  if (REJECT_EXT_RE.test(url) || REJECT_EXT_RE.test(title)) return -1;
  if (mime && !ACCEPTED_MIMES.has(mime)) return -1;
  if (REJECT_TITLE_RE.test(title)) return -1;

  const w = info.width ?? 0;
  const h = info.height ?? 0;
  if (w > 0 && h > 0 && w < h) {
    // Strongly prefer landscape aircraft exterior shots
    return -1;
  }
  if (w > 0 && w < 320) return -1;

  const hay = `${title} ${stripHtml(info.extmetadata?.ImageDescription?.value)}`.toLowerCase();
  let score = 10;
  for (const tok of modelTokens) {
    if (tok.length >= 2 && hay.includes(tok)) score += 6;
  }
  for (const tok of airlineTokens) {
    if (tok.length >= 3 && hay.includes(tok)) score += 8;
  }
  if (w >= 720) score += 2;
  if (/(airport|runway|landing|takeoff|taxi|apron|final|boeing|airbus|jet)/i.test(hay)) {
    score += 3;
  }
  return score;
}

export class AircraftPhotoService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  private getCacheKey(q: AircraftPhotoQuery): string {
    return [
      (q.icao24 ?? "").trim().toLowerCase(),
      q.preferRegistration ? (q.registration ?? "").trim().toUpperCase() : "",
      (q.airline ?? "").trim().toLowerCase(),
      (q.model ?? "").trim().toLowerCase(),
      (q.typeCode ?? "").trim().toLowerCase(),
    ].join("|");
  }

  async resolvePhoto(query: AircraftPhotoQuery): Promise<AircraftPhotoResult> {
    const key = this.getCacheKey(query);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    let resolved: AircraftPhotoResult = { found: false };

    // 1. Exact airframe photo by ICAO24 transponder hex via Planespotters.net
    const hex = (query.icao24 ?? "").trim().toLowerCase();
    if (/^[a-f0-9]{6}$/.test(hex)) {
      resolved = await this.searchPlanespotters(
        `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(hex)}`,
        "icao24_hex",
        `ICAO ${hex.toUpperCase()}`
      );
    }

    // 2. Exact airframe photo by tail registration (only when explicitly requested for real tails)
    const reg = (query.registration ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!resolved.found && query.preferRegistration && reg.length >= 4) {
      resolved = await this.searchPlanespotters(
        `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`,
        "registration",
        `Reg ${reg}`
      );
    }

    // 3. Fallback to Wikimedia Commons by airline + model -> model only
    if (!resolved.found) {
      const searchPlan = buildSearchQueries(query);
      const airlineTokens = cleanAirlineName(query.airline ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3 && t !== "airlines" && t !== "airways" && t !== "air");
      const modelTokens = normalizeAircraftModelFamily(query.model ?? query.typeCode ?? "")
        .toLowerCase()
        .split(/[\s-]+/)
        .filter((t) => t.length >= 2);

      for (const step of searchPlan) {
        const candidate = await this.searchWikimedia(
          step.search,
          step.matchedBy,
          airlineTokens,
          modelTokens
        );
        if (candidate.found && candidate.url) {
          resolved = candidate;
          break;
        }
      }
    }

    this.cache.set(key, {
      expiresAt: now + (resolved.found ? CACHE_TTL_MS : 15 * 60 * 1000),
      result: resolved,
    });
    return resolved;
  }

  private async searchPlanespotters(
    endpoint: string,
    matchedBy: "icao24_hex" | "registration",
    captionPrefix: string
  ): Promise<AircraftPhotoResult> {
    try {
      const res = await this.fetchFn(endpoint, {
        headers: {
          "User-Agent": "AirCommandATC/2.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return { found: false };
      const data = (await res.json()) as {
        photos?: Array<{
          id?: string;
          link?: string;
          photographer?: string;
          thumbnail?: { src?: string };
          thumbnail_large?: { src?: string };
        }>;
      };
      const first = data.photos?.[0];
      const url = first?.thumbnail_large?.src ?? first?.thumbnail?.src;
      if (!url) return { found: false };
      return {
        found: true,
        url,
        fullUrl: first?.link ?? url,
        source: "Planespotters.net",
        photographer: first?.photographer?.trim() || "Planespotters",
        caption: `${captionPrefix} • Planespotters.net`,
        matchedBy,
      };
    } catch {
      return { found: false };
    }
  }

  private async searchWikimedia(
    gsrsearch: string,
    matchedBy: "airline_model" | "model_only",
    airlineTokens: string[],
    modelTokens: string[]
  ): Promise<AircraftPhotoResult> {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch,
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "760",
      format: "json",
      origin: "*",
    });

    const endpoint = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
    try {
      const res = await this.fetchFn(endpoint, {
        headers: {
          "User-Agent": "AirCommandATC/1.0 (https://github.com/aircommand-atc; education-sim)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return { found: false };

      const data = (await res.json()) as {
        query?: { pages?: Record<string, WikimediaPage> };
      };
      const pages = Object.values(data.query?.pages ?? {});
      if (pages.length === 0) return { found: false };

      let bestPage: WikimediaPage | null = null;
      let bestScore = -1;
      for (const page of pages) {
        const s = scoreCandidate(page, airlineTokens, modelTokens);
        if (s > bestScore) {
          bestScore = s;
          bestPage = page;
        }
      }
      if (!bestPage || bestScore < 10) return { found: false };

      const info = bestPage.imageinfo![0]!;
      const url = info.thumburl ?? info.url;
      if (!url) return { found: false };

      const artist = stripHtml(info.extmetadata?.Artist?.value).slice(0, 48);
      const caption = (bestPage.title ?? "")
        .replace(/^File:/i, "")
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/_/g, " ")
        .slice(0, 72);

      return {
        found: true,
        url,
        fullUrl: info.url ?? url,
        source: "Wikimedia Commons",
        photographer: artist || "Wikimedia contributor",
        caption,
        matchedBy,
      };
    } catch {
      return { found: false };
    }
  }
}
