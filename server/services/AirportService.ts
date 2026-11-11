import type { AirportRecord } from "../../src/types/atc.ts";
import { haversineNm } from "../../src/utils/geo.ts";
import { DatabaseService } from "../db/DatabaseService.ts";

export class AirportService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  searchAirports(opts: {
    q?: string;
    country?: string;
    category?: string;
    nearLat?: number;
    nearLon?: number;
    radiusNm?: number;
    limit?: number;
  }): Array<AirportRecord & { distanceNm?: number }> {
    const wantsNearby =
      opts.nearLat !== undefined &&
      opts.nearLon !== undefined &&
      Number.isFinite(opts.nearLat) &&
      Number.isFinite(opts.nearLon);

    const rows = this.db.queryAirports({
      q: opts.q,
      country: opts.country,
      category: opts.category,
      limit: wantsNearby ? 2000 : opts.limit ?? 300,
    });

    if (wantsNearby) {
      const lat0 = opts.nearLat!;
      const lon0 = opts.nearLon!;
      const maxRadius = opts.radiusNm ?? 250;
      return rows
        .map((a) => ({
          ...a,
          distanceNm: Number(haversineNm(lat0, lon0, a.lat, a.lon).toFixed(1)),
        }))
        .filter((a) => a.distanceNm <= maxRadius)
        .sort((a, b) => a.distanceNm - b.distanceNm)
        .slice(0, opts.limit ?? 60);
    }

    return rows;
  }

  getAirport(icao: string): AirportRecord | null {
    return this.db.getAirportByIcao(icao);
  }
}
