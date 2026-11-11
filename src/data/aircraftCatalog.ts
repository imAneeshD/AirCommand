import type { Aircraft, AirportId, AirportLayout } from "../types/atc.ts";

export type AirframeStyle = "NARROW_BOEING" | "NARROW_AIRBUS" | "WIDE_BOEING" | "TRIJET_MD11";

export interface AircraftTypeSpec {
  code: string;
  model: string;
  manufacturer: string;
  bodyClass: string;
  airframeStyle: AirframeStyle;
  engines: string;
  wingspan: string;
  length: string;
  mtow: string;
  rangeNm: string;
  cruiseSpeed: string;
  ceiling: string;
  capacityPax: string;
  isCargoOnly?: boolean;
}

export interface AirlineLivery {
  airlineName: string;
  iataCode: string;
  title: string;
  fuselage: string;
  belly: string;
  cheatline: string;
  tailBg: string;
  tailAccent: string;
  nacelle: string;
  textColor: string;
  isCargo?: boolean;
}

export interface HubAirportInfo {
  icao: string;
  city: string;
  name: string;
}

export const HUB_AIRPORTS: HubAirportInfo[] = [
  { icao: "KORD", city: "Chicago, IL", name: "Chicago O'Hare Intl" },
  { icao: "KJFK", city: "New York, NY", name: "John F. Kennedy Intl" },
  { icao: "KLAX", city: "Los Angeles, CA", name: "Los Angeles Intl" },
  { icao: "KDEN", city: "Denver, CO", name: "Denver Intl" },
  { icao: "KATL", city: "Atlanta, GA", name: "Hartsfield-Jackson Intl" },
  { icao: "KSFO", city: "San Francisco, CA", name: "San Francisco Intl" },
  { icao: "KDFW", city: "Dallas, TX", name: "Dallas/Fort Worth Intl" },
  { icao: "KBOS", city: "Boston, MA", name: "Boston Logan Intl" },
  { icao: "KSEA", city: "Seattle, WA", name: "Seattle-Tacoma Intl" },
  { icao: "KMIA", city: "Miami, FL", name: "Miami Intl" },
];

export const AIRCRAFT_TYPE_SPECS: Record<string, AircraftTypeSpec> = {
  B738: {
    code: "B738",
    model: "Boeing 737-800 Next Gen",
    manufacturer: "Boeing",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_BOEING",
    engines: "2 × CFM56-7B26",
    wingspan: "35.8 m (117 ft)",
    length: "39.5 m (129 ft)",
    mtow: "79,015 kg",
    rangeNm: "2,935 NM",
    cruiseSpeed: "M0.79 (453 kt)",
    ceiling: "FL410",
    capacityPax: "162–189 PAX",
  },
  B737: {
    code: "B737",
    model: "Boeing 737-700 Next Gen",
    manufacturer: "Boeing",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_BOEING",
    engines: "2 × CFM56-7B24",
    wingspan: "35.8 m (117 ft)",
    length: "33.6 m (110 ft)",
    mtow: "70,080 kg",
    rangeNm: "3,010 NM",
    cruiseSpeed: "M0.78 (448 kt)",
    ceiling: "FL410",
    capacityPax: "126–149 PAX",
  },
  B739: {
    code: "B739",
    model: "Boeing 737-900ER",
    manufacturer: "Boeing",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_BOEING",
    engines: "2 × CFM56-7B27",
    wingspan: "35.8 m (117 ft)",
    length: "42.1 m (138 ft)",
    mtow: "85,130 kg",
    rangeNm: "2,950 NM",
    cruiseSpeed: "M0.79 (455 kt)",
    ceiling: "FL410",
    capacityPax: "180–215 PAX",
  },
  B38M: {
    code: "B38M",
    model: "Boeing 737 MAX 8",
    manufacturer: "Boeing",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_BOEING",
    engines: "2 × CFM LEAP-1B",
    wingspan: "35.9 m (118 ft)",
    length: "39.5 m (130 ft)",
    mtow: "82,190 kg",
    rangeNm: "3,550 NM",
    cruiseSpeed: "M0.79 (453 kt)",
    ceiling: "FL410",
    capacityPax: "162–197 PAX",
  },
  B752: {
    code: "B752",
    model: "Boeing 757-200",
    manufacturer: "Boeing",
    bodyClass: "Long Narrowbody Twinjet",
    airframeStyle: "NARROW_BOEING",
    engines: "2 × PW2037 / RB211",
    wingspan: "38.1 m (125 ft)",
    length: "47.3 m (155 ft)",
    mtow: "115,680 kg",
    rangeNm: "3,915 NM",
    cruiseSpeed: "M0.80 (460 kt)",
    ceiling: "FL420",
    capacityPax: "200–239 PAX",
  },
  B763: {
    code: "B763",
    model: "Boeing 767-300ERF",
    manufacturer: "Boeing",
    bodyClass: "Widebody Freighter / Pax",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GE CF6-80C2B7F",
    wingspan: "47.6 m (156 ft)",
    length: "54.9 m (180 ft)",
    mtow: "186,880 kg",
    rangeNm: "3,255 NM",
    cruiseSpeed: "M0.80 (462 kt)",
    ceiling: "FL430",
    capacityPax: "116,000 lbs Cargo",
  },
  B772: {
    code: "B772",
    model: "Boeing 777-200ER",
    manufacturer: "Boeing",
    bodyClass: "Widebody Heavy Twinjet",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GE90-94B",
    wingspan: "60.9 m (200 ft)",
    length: "63.7 m (209 ft)",
    mtow: "297,550 kg",
    rangeNm: "7,065 NM",
    cruiseSpeed: "M0.84 (482 kt)",
    ceiling: "FL431",
    capacityPax: "305–325 PAX",
  },
  A319: {
    code: "A319",
    model: "Airbus A319-100",
    manufacturer: "Airbus",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_AIRBUS",
    engines: "2 × IAE V2524-A5",
    wingspan: "35.8 m (117 ft)",
    length: "33.8 m (111 ft)",
    mtow: "75,500 kg",
    rangeNm: "3,750 NM",
    cruiseSpeed: "M0.78 (447 kt)",
    ceiling: "FL398",
    capacityPax: "124–144 PAX",
  },
  A320: {
    code: "A320",
    model: "Airbus A320-200",
    manufacturer: "Airbus",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_AIRBUS",
    engines: "2 × CFM56-5B4",
    wingspan: "35.8 m (117 ft)",
    length: "37.6 m (123 ft)",
    mtow: "78,000 kg",
    rangeNm: "3,300 NM",
    cruiseSpeed: "M0.78 (447 kt)",
    ceiling: "FL398",
    capacityPax: "150–180 PAX",
  },
  A321: {
    code: "A321",
    model: "Airbus A321neo",
    manufacturer: "Airbus",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_AIRBUS",
    engines: "2 × CFM LEAP-1A32",
    wingspan: "35.8 m (117 ft)",
    length: "44.5 m (146 ft)",
    mtow: "97,000 kg",
    rangeNm: "4,000 NM",
    cruiseSpeed: "M0.79 (452 kt)",
    ceiling: "FL398",
    capacityPax: "190–220 PAX",
  },
  A220: {
    code: "A220",
    model: "Airbus A220-300",
    manufacturer: "Airbus",
    bodyClass: "Regional Narrowbody",
    airframeStyle: "NARROW_AIRBUS",
    engines: "2 × PW1524G Geared",
    wingspan: "35.1 m (115 ft)",
    length: "38.7 m (127 ft)",
    mtow: "70,900 kg",
    rangeNm: "3,400 NM",
    cruiseSpeed: "M0.78 (447 kt)",
    ceiling: "FL410",
    capacityPax: "130–160 PAX",
  },
  MD11: {
    code: "MD11",
    model: "McDonnell Douglas MD-11F",
    manufacturer: "McDonnell Douglas",
    bodyClass: "Heavy Tri-Jet Freighter",
    airframeStyle: "TRIJET_MD11",
    engines: "3 × GE CF6-80C2D1F",
    wingspan: "51.7 m (170 ft)",
    length: "61.2 m (201 ft)",
    mtow: "285,990 kg",
    rangeNm: "3,950 NM",
    cruiseSpeed: "M0.83 (476 kt)",
    ceiling: "FL430",
    capacityPax: "200,000 lbs Cargo",
    isCargoOnly: true,
  },
};

export const AIRLINE_LIVERIES: Record<string, AirlineLivery> = {
  UAL: {
    airlineName: "United Airlines",
    iataCode: "UA",
    title: "UNITED",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#0284c7",
    tailBg: "#0c4a6e",
    tailAccent: "#38bdf8",
    nacelle: "#0369a1",
    textColor: "#0f172a",
  },
  DAL: {
    airlineName: "Delta Air Lines",
    iataCode: "DL",
    title: "DELTA",
    fuselage: "#f8fafc",
    belly: "#1e293b",
    cheatline: "#b91c1c",
    tailBg: "#172554",
    tailAccent: "#dc2626",
    nacelle: "#1e3a8a",
    textColor: "#172554",
  },
  AAL: {
    airlineName: "American Airlines",
    iataCode: "AA",
    title: "American",
    fuselage: "#e5e7eb",
    belly: "#cbd5e1",
    cheatline: "#dc2626",
    tailBg: "#dc2626",
    tailAccent: "#1d4ed8",
    nacelle: "#9ca3af",
    textColor: "#334155",
  },
  SWA: {
    airlineName: "Southwest Airlines",
    iataCode: "WN",
    title: "Southwest",
    fuselage: "#1d4ed8",
    belly: "#1e40af",
    cheatline: "#facc15",
    tailBg: "#b91c1c",
    tailAccent: "#f59e0b",
    nacelle: "#1d4ed8",
    textColor: "#ffffff",
  },
  JBU: {
    airlineName: "JetBlue Airways",
    iataCode: "B6",
    title: "jetBlue",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#0284c7",
    tailBg: "#0f172a",
    tailAccent: "#0ea5e9",
    nacelle: "#0f172a",
    textColor: "#0369a1",
  },
  FDX: {
    airlineName: "FedEx Express",
    iataCode: "FX",
    title: "FedEx",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#ea580c",
    tailBg: "#4c1d95",
    tailAccent: "#f97316",
    nacelle: "#4c1d95",
    textColor: "#4c1d95",
    isCargo: true,
  },
};

function hashCallsign(callsign: string): number {
  let h = 0;
  for (let i = 0; i < callsign.length; i++) {
    h = (h * 31 + callsign.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getAircraftTypeSpec(typeCode: string): AircraftTypeSpec {
  return (
    AIRCRAFT_TYPE_SPECS[typeCode] ?? {
      code: typeCode,
      model: `${typeCode} Commercial Jet`,
      manufacturer: typeCode.startsWith("A") ? "Airbus" : "Boeing",
      bodyClass: "Twinjet",
      airframeStyle: typeCode.startsWith("A") ? "NARROW_AIRBUS" : "NARROW_BOEING",
      engines: "2 × High-Bypass Turbofan",
      wingspan: "35.8 m",
      length: "38.5 m",
      mtow: "78,000 kg",
      rangeNm: "3,000 NM",
      cruiseSpeed: "M0.78 (450 kt)",
      ceiling: "FL410",
      capacityPax: "160 PAX",
    }
  );
}

export function getAirlineLivery(ac: Pick<Aircraft, "callsign" | "airline">): AirlineLivery {
  const prefix = ac.callsign.slice(0, 3).toUpperCase();
  if (AIRLINE_LIVERIES[prefix]) return AIRLINE_LIVERIES[prefix];
  const lower = ac.airline.toLowerCase();
  for (const liv of Object.values(AIRLINE_LIVERIES)) {
    if (lower.includes(liv.airlineName.split(" ")[0].toLowerCase())) return liv;
  }
  return {
    airlineName: ac.airline,
    iataCode: prefix.slice(0, 2),
    title: ac.airline.split(" ")[0] || prefix,
    fuselage: "#f8fafc",
    belly: "#cbd5e1",
    cheatline: "#0284c7",
    tailBg: "#0f172a",
    tailAccent: "#eab308",
    nacelle: "#475569",
    textColor: "#0f172a",
  };
}

export function pickRemoteHub(seed: number, excludeAirportId: AirportId): HubAirportInfo {
  const choices = HUB_AIRPORTS.filter((h) => h.icao !== excludeAirportId);
  return choices[seed % choices.length];
}

export function deriveFlightMetadata(
  callsign: string,
  flightKind: Aircraft["flightKind"],
  airport: { id: AirportId; icao: string; name: string; city: string },
  aircraftType: string
): {
  originIcao: string;
  originName: string;
  destinationIcao: string;
  destinationName: string;
  registration: string;
  cruiseFlightLevel: string;
  soulsOnBoard: string;
  fuelRemainingPct: number;
} {
  const h = hashCallsign(callsign);
  const remote = pickRemoteHub(h, airport.id);
  const prefix = callsign.slice(0, 3).toUpperCase();
  const digits = callsign.replace(/\D/g, "") || String(100 + (h % 899));
  const suffix = prefix.slice(0, 2) || "AT";
  const registration = `N${digits.padStart(3, "4").slice(0, 3)}${suffix}`;

  const levels = ["FL320", "FL340", "FL360", "FL380", "FL390"];
  const cruiseFlightLevel = levels[h % levels.length];

  const isCargo = prefix === "FDX" || aircraftType === "MD11" || aircraftType === "B763";
  const soulsOnBoard = isCargo
    ? `${112 + (h % 65)},000 lbs Freight • 3 Crew`
    : `${128 + (h % 68)} PAX • ${5 + (h % 3)} Crew`;

  const fuelRemainingPct =
    flightKind === "DEPARTURE" ? 72 + (h % 24) : 26 + (h % 28);

  if (flightKind === "DEPARTURE") {
    return {
      originIcao: airport.icao,
      originName: `${airport.city} (${airport.name})`,
      destinationIcao: remote.icao,
      destinationName: `${remote.city} (${remote.name})`,
      registration,
      cruiseFlightLevel,
      soulsOnBoard,
      fuelRemainingPct,
    };
  }

  return {
    originIcao: remote.icao,
    originName: `${remote.city} (${remote.name})`,
    destinationIcao: airport.icao,
    destinationName: `${airport.city} (${airport.name})`,
    registration,
    cruiseFlightLevel,
    soulsOnBoard,
    fuelRemainingPct,
  };
}

export function getResolvedAircraftDetails(ac: Aircraft, airport: AirportLayout) {
  const spec = getAircraftTypeSpec(ac.aircraftType);
  const livery = getAirlineLivery(ac);
  const fallback = deriveFlightMetadata(ac.callsign, ac.flightKind, airport, ac.aircraftType);
  const digits = ac.callsign.replace(/\D/g, "") || "100";

  return {
    spec,
    livery,
    flightNumber: `${livery.iataCode} ${digits}`,
    originIcao: ac.originIcao ?? fallback.originIcao,
    originName: ac.originName ?? fallback.originName,
    destinationIcao: ac.destinationIcao ?? fallback.destinationIcao,
    destinationName: ac.destinationName ?? fallback.destinationName,
    registration: ac.registration ?? fallback.registration,
    cruiseFlightLevel: ac.cruiseFlightLevel ?? fallback.cruiseFlightLevel,
    soulsOnBoard: ac.soulsOnBoard ?? fallback.soulsOnBoard,
    fuelRemainingPct: ac.fuelRemainingPct ?? fallback.fuelRemainingPct,
  };
}
