import type { Aircraft, AirportId, AirportLayout } from "../types/atc.ts";

export type AirframeStyle =
  | "NARROW_BOEING"
  | "NARROW_AIRBUS"
  | "WIDE_BOEING"
  | "WIDE_AIRBUS"
  | "TRIJET_MD11"
  | "MILITARY_TRANSPORT"
  | "TURBOPROP_REGIONAL";

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

export const REGIONAL_HUBS: Record<string, HubAirportInfo[]> = {
  INDIA: [
    { icao: "VIDP", city: "Delhi", name: "Indira Gandhi Intl (DEL)" },
    { icao: "VABB", city: "Mumbai", name: "Chhatrapati Shivaji Maharaj Intl (BOM)" },
    { icao: "VOBL", city: "Bengaluru", name: "Kempegowda Intl (BLR)" },
    { icao: "VOMM", city: "Chennai", name: "Chennai Intl (MAA)" },
    { icao: "VOHS", city: "Hyderabad", name: "Rajiv Gandhi Intl (HYD)" },
    { icao: "VECC", city: "Kolkata", name: "Netaji Subhash Chandra Bose Intl (CCU)" },
    { icao: "VOCI", city: "Kochi", name: "Cochin Intl (COK)" },
    { icao: "VAGO", city: "Goa", name: "Dabolim Intl (GOI)" },
    { icao: "VAPO", city: "Pune", name: "Pune Intl (PNQ)" },
    { icao: "VAAH", city: "Ahmedabad", name: "Sardar Vallabhbhai Patel Intl (AMD)" },
    { icao: "VIAR", city: "Amritsar", name: "Sri Guru Ram Dass Jee Intl (ATQ)" },
    { icao: "VOVZ", city: "Visakhapatnam", name: "Visakhapatnam Intl (VTZ)" },
    { icao: "VOTV", city: "Thiruvananthapuram", name: "Trivandrum Intl (TRV)" },
    { icao: "VIJP", city: "Jaipur", name: "Jaipur Intl (JAI)" },
    { icao: "VILK", city: "Lucknow", name: "Chaudhary Charan Singh Intl (LKO)" },
  ],
  INTERNATIONAL: [
    { icao: "OMDB", city: "Dubai", name: "Dubai Intl (DXB)" },
    { icao: "OTHH", city: "Doha", name: "Hamad Intl (DOH)" },
    { icao: "WSSS", city: "Singapore", name: "Singapore Changi (SIN)" },
    { icao: "EGLL", city: "London", name: "London Heathrow (LHR)" },
    { icao: "EDDF", city: "Frankfurt", name: "Frankfurt Main (FRA)" },
    { icao: "LFPG", city: "Paris", name: "Paris Charles de Gaulle (CDG)" },
    { icao: "EHAM", city: "Amsterdam", name: "Amsterdam Schiphol (AMS)" },
    { icao: "OMAA", city: "Abu Dhabi", name: "Zayed Intl (AUH)" },
    { icao: "OEJN", city: "Jeddah", name: "King Abdulaziz Intl (JED)" },
    { icao: "WMKK", city: "Kuala Lumpur", name: "Kuala Lumpur Intl (KUL)" },
    { icao: "LTFM", city: "Istanbul", name: "Istanbul Airport (IST)" },
    { icao: "VTBS", city: "Bangkok", name: "Suvarnabhumi (BKK)" },
  ],
  US: HUB_AIRPORTS,
};

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
  B77W: {
    code: "B77W",
    model: "Boeing 777-300ER",
    manufacturer: "Boeing",
    bodyClass: "Widebody Heavy Flagship",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GE90-115B",
    wingspan: "64.8 m (212 ft)",
    length: "73.9 m (242 ft)",
    mtow: "351,533 kg",
    rangeNm: "7,370 NM",
    cruiseSpeed: "M0.84 (482 kt)",
    ceiling: "FL431",
    capacityPax: "365–420 PAX",
  },
  B77F: {
    code: "B77F",
    model: "Boeing 777F Freighter",
    manufacturer: "Boeing",
    bodyClass: "Heavy Widebody Twinjet Freighter",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GE90-110B1L",
    wingspan: "64.8 m (212 ft)",
    length: "63.7 m (209 ft)",
    mtow: "347,815 kg",
    rangeNm: "4,970 NM",
    cruiseSpeed: "M0.84 (482 kt)",
    ceiling: "FL431",
    capacityPax: "224,900 lbs Cargo",
    isCargoOnly: true,
  },
  B788: {
    code: "B788",
    model: "Boeing 787-8 Dreamliner",
    manufacturer: "Boeing",
    bodyClass: "Widebody Twinjet",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GEnx-1B / Trent 1000",
    wingspan: "60.1 m (197 ft)",
    length: "56.7 m (186 ft)",
    mtow: "227,930 kg",
    rangeNm: "7,355 NM",
    cruiseSpeed: "M0.85 (488 kt)",
    ceiling: "FL430",
    capacityPax: "248–260 PAX",
  },
  B789: {
    code: "B789",
    model: "Boeing 787-9 Dreamliner",
    manufacturer: "Boeing",
    bodyClass: "Widebody Heavy Twinjet",
    airframeStyle: "WIDE_BOEING",
    engines: "2 × GEnx-1B / Trent 1000",
    wingspan: "60.1 m (197 ft)",
    length: "62.8 m (206 ft)",
    mtow: "254,000 kg",
    rangeNm: "7,565 NM",
    cruiseSpeed: "M0.85 (488 kt)",
    ceiling: "FL430",
    capacityPax: "296–330 PAX",
  },
  B744: {
    code: "B744",
    model: "Boeing 747-400 Queen of the Skies",
    manufacturer: "Boeing",
    bodyClass: "Heavy Widebody Quadjet",
    airframeStyle: "WIDE_BOEING",
    engines: "4 × GE CF6-80C2B1F / PW4056",
    wingspan: "64.4 m (211 ft)",
    length: "70.6 m (231 ft)",
    mtow: "396,890 kg",
    rangeNm: "7,260 NM",
    cruiseSpeed: "M0.85 (490 kt)",
    ceiling: "FL450",
    capacityPax: "416–524 PAX",
  },
  B748: {
    code: "B748",
    model: "Boeing 747-8F / 747-8i",
    manufacturer: "Boeing",
    bodyClass: "Heavy Super Quadjet Freighter / Pax",
    airframeStyle: "WIDE_BOEING",
    engines: "4 × GEnx-2B67",
    wingspan: "68.4 m (224 ft)",
    length: "76.3 m (250 ft)",
    mtow: "447,700 kg",
    rangeNm: "4,120 NM",
    cruiseSpeed: "M0.85 (490 kt)",
    ceiling: "FL450",
    capacityPax: "307,000 lbs Cargo",
    isCargoOnly: true,
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
  A20N: {
    code: "A20N",
    model: "Airbus A320neo",
    manufacturer: "Airbus",
    bodyClass: "Narrowbody Twinjet",
    airframeStyle: "NARROW_AIRBUS",
    engines: "2 × CFM LEAP-1A26 / PW1127G",
    wingspan: "35.8 m (117 ft)",
    length: "37.6 m (123 ft)",
    mtow: "79,000 kg",
    rangeNm: "3,500 NM",
    cruiseSpeed: "M0.78 (447 kt)",
    ceiling: "FL398",
    capacityPax: "165–186 PAX",
  },
  A332: {
    code: "A332",
    model: "Airbus A330-200 / A330-200F",
    manufacturer: "Airbus",
    bodyClass: "Widebody Heavy Twinjet / Freighter",
    airframeStyle: "WIDE_AIRBUS",
    engines: "2 × Rolls-Royce Trent 700 / GE CF6",
    wingspan: "60.3 m (198 ft)",
    length: "58.8 m (193 ft)",
    mtow: "242,000 kg",
    rangeNm: "7,250 NM",
    cruiseSpeed: "M0.82 (470 kt)",
    ceiling: "FL411",
    capacityPax: "246 PAX / 154,000 lbs Cargo",
  },
  A333: {
    code: "A333",
    model: "Airbus A330-300",
    manufacturer: "Airbus",
    bodyClass: "Widebody Heavy Twinjet",
    airframeStyle: "WIDE_AIRBUS",
    engines: "2 × Rolls-Royce Trent 772B",
    wingspan: "60.3 m (198 ft)",
    length: "63.7 m (209 ft)",
    mtow: "242,000 kg",
    rangeNm: "6,350 NM",
    cruiseSpeed: "M0.82 (470 kt)",
    ceiling: "FL411",
    capacityPax: "277–300 PAX",
  },
  A339: {
    code: "A339",
    model: "Airbus A330-900neo",
    manufacturer: "Airbus",
    bodyClass: "Widebody Heavy Twinjet",
    airframeStyle: "WIDE_AIRBUS",
    engines: "2 × Rolls-Royce Trent 7000",
    wingspan: "64.0 m (210 ft)",
    length: "63.7 m (209 ft)",
    mtow: "251,000 kg",
    rangeNm: "7,200 NM",
    cruiseSpeed: "M0.82 (470 kt)",
    ceiling: "FL411",
    capacityPax: "287–310 PAX",
  },
  A359: {
    code: "A359",
    model: "Airbus A350-900 XWB",
    manufacturer: "Airbus",
    bodyClass: "Widebody Heavy Twinjet",
    airframeStyle: "WIDE_AIRBUS",
    engines: "2 × Rolls-Royce Trent XWB-84",
    wingspan: "64.75 m (212 ft)",
    length: "66.8 m (219 ft)",
    mtow: "280,000 kg",
    rangeNm: "8,100 NM",
    cruiseSpeed: "M0.85 (488 kt)",
    ceiling: "FL431",
    capacityPax: "315–369 PAX",
  },
  A35K: {
    code: "A35K",
    model: "Airbus A350-1000 XWB",
    manufacturer: "Airbus",
    bodyClass: "Widebody Heavy Flagship",
    airframeStyle: "WIDE_AIRBUS",
    engines: "2 × Rolls-Royce Trent XWB-97",
    wingspan: "64.75 m (212 ft)",
    length: "73.8 m (242 ft)",
    mtow: "319,000 kg",
    rangeNm: "8,700 NM",
    cruiseSpeed: "M0.85 (488 kt)",
    ceiling: "FL431",
    capacityPax: "369–410 PAX",
  },
  A388: {
    code: "A388",
    model: "Airbus A380-800 Superjumbo",
    manufacturer: "Airbus",
    bodyClass: "Super Heavy Double-Deck Quadjet",
    airframeStyle: "WIDE_AIRBUS",
    engines: "4 × Engine Alliance GP7270 / Trent 970",
    wingspan: "79.75 m (262 ft)",
    length: "72.7 m (239 ft)",
    mtow: "575,000 kg",
    rangeNm: "8,000 NM",
    cruiseSpeed: "M0.85 (488 kt)",
    ceiling: "FL430",
    capacityPax: "525–615 PAX",
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
  C17: {
    code: "C17",
    model: "Boeing C-17 Globemaster III",
    manufacturer: "Boeing Defense",
    bodyClass: "Heavy Strategic Military Airlifter",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "4 × Pratt & Whitney F117-PW-100",
    wingspan: "51.75 m (170 ft)",
    length: "53.0 m (174 ft)",
    mtow: "265,350 kg",
    rangeNm: "2,420 NM (170,900 lbs payload)",
    cruiseSpeed: "M0.74 (450 kt)",
    ceiling: "FL450",
    capacityPax: "102 Paratroopers • 170,900 lbs Cargo",
    isCargoOnly: true,
  },
  C130: {
    code: "C130",
    model: "Lockheed C-130J Super Hercules",
    manufacturer: "Lockheed Martin",
    bodyClass: "Tactical Military Turboprop Transport",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "4 × Rolls-Royce AE 2100D3 Turboprops",
    wingspan: "40.4 m (132 ft)",
    length: "29.8 m (98 ft)",
    mtow: "70,305 kg",
    rangeNm: "1,800 NM",
    cruiseSpeed: "350 kt (390 mph)",
    ceiling: "FL280",
    capacityPax: "92 Troops • 42,000 lbs Cargo",
    isCargoOnly: true,
  },
  A400: {
    code: "A400",
    model: "Airbus A400M Atlas",
    manufacturer: "Airbus Military",
    bodyClass: "Heavy Tactical Military Airlifter",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "4 × Europrop TP400-D6 Turboprops",
    wingspan: "42.4 m (139 ft)",
    length: "45.1 m (148 ft)",
    mtow: "141,000 kg",
    rangeNm: "2,450 NM",
    cruiseSpeed: "M0.72 (420 kt)",
    ceiling: "FL400",
    capacityPax: "116 Troops • 81,600 lbs Cargo",
    isCargoOnly: true,
  },
  K35R: {
    code: "K35R",
    model: "Boeing KC-135R Stratotanker",
    manufacturer: "Boeing Defense",
    bodyClass: "Military Aerial Refueling Tanker",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "4 × CFM56 / F108-CF-100",
    wingspan: "39.9 m (131 ft)",
    length: "41.5 m (136 ft)",
    mtow: "146,000 kg",
    rangeNm: "1,500 NM (150,000 lbs transfer fuel)",
    cruiseSpeed: "M0.80 (460 kt)",
    ceiling: "FL500",
    capacityPax: "200,000 lbs Transfer Fuel • 8 Crew",
    isCargoOnly: true,
  },
  P8: {
    code: "P8",
    model: "Boeing P-8I / P-8A Poseidon",
    manufacturer: "Boeing Defense",
    bodyClass: "Military Maritime Patrol / Reconnaissance",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "2 × CFM56-7B27A",
    wingspan: "37.6 m (123 ft)",
    length: "39.5 m (129 ft)",
    mtow: "85,820 kg",
    rangeNm: "1,200 NM on-station (4,500 NM ferry)",
    cruiseSpeed: "M0.79 (450 kt)",
    ceiling: "FL410",
    capacityPax: "Maritime Reconnaissance Suite • 9 Crew",
  },
  SU30: {
    code: "SU30",
    model: "Sukhoi Su-30MKI Flanker",
    manufacturer: "Sukhoi / HAL",
    bodyClass: "Military Multi-Role Air Superiority Fighter",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "2 × AL-31FP Thrust-Vectoring Turbofans",
    wingspan: "14.7 m (48 ft)",
    length: "21.9 m (72 ft)",
    mtow: "38,800 kg",
    rangeNm: "1,620 NM",
    cruiseSpeed: "M1.9 (1,150 kt)",
    ceiling: "FL560",
    capacityPax: "2 Crew (Pilot + WSO)",
  },
  F16: {
    code: "F16",
    model: "General Dynamics F-16 Fighting Falcon",
    manufacturer: "Lockheed Martin",
    bodyClass: "Military Supersonic Multirole Fighter",
    airframeStyle: "MILITARY_TRANSPORT",
    engines: "1 × GE F110-GE-129 Afterburning Turbofan",
    wingspan: "9.96 m (33 ft)",
    length: "15.06 m (49 ft)",
    mtow: "19,200 kg",
    rangeNm: "1,200 NM",
    cruiseSpeed: "M2.0 (1,200 kt)",
    ceiling: "FL500",
    capacityPax: "1 Pilot",
  },
  AT76: {
    code: "AT76",
    model: "ATR 72-600",
    manufacturer: "ATR (Airbus / Leonardo)",
    bodyClass: "Regional Twin-Turboprop",
    airframeStyle: "TURBOPROP_REGIONAL",
    engines: "2 × Pratt & Whitney Canada PW127M",
    wingspan: "27.05 m (89 ft)",
    length: "27.17 m (89 ft)",
    mtow: "23,000 kg",
    rangeNm: "825 NM",
    cruiseSpeed: "275 kt (316 mph)",
    ceiling: "FL250",
    capacityPax: "70–78 PAX",
  },
  E190: {
    code: "E190",
    model: "Embraer E190-E2",
    manufacturer: "Embraer",
    bodyClass: "Regional Advanced Twinjet",
    airframeStyle: "TURBOPROP_REGIONAL",
    engines: "2 × Pratt & Whitney PW1900G Geared",
    wingspan: "33.7 m (111 ft)",
    length: "36.2 m (119 ft)",
    mtow: "56,400 kg",
    rangeNm: "2,850 NM",
    cruiseSpeed: "M0.80 (460 kt)",
    ceiling: "FL410",
    capacityPax: "96–114 PAX",
  },
  CRJ9: {
    code: "CRJ9",
    model: "Bombardier CRJ-900 NextGen",
    manufacturer: "Bombardier / MHI",
    bodyClass: "Regional Twinjet",
    airframeStyle: "TURBOPROP_REGIONAL",
    engines: "2 × GE CF34-8C5",
    wingspan: "24.9 m (82 ft)",
    length: "36.4 m (119 ft)",
    mtow: "38,330 kg",
    rangeNm: "1,550 NM",
    cruiseSpeed: "M0.80 (460 kt)",
    ceiling: "FL410",
    capacityPax: "76–90 PAX",
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
  IGO: {
    airlineName: "IndiGo Airlines",
    iataCode: "6E",
    title: "IndiGo",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#1d4ed8",
    tailBg: "#1e3a8a",
    tailAccent: "#38bdf8",
    nacelle: "#1e3a8a",
    textColor: "#1e3a8a",
  },
  AIC: {
    airlineName: "Air India",
    iataCode: "AI",
    title: "AIR INDIA",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#b91c1c",
    tailBg: "#991b1b",
    tailAccent: "#f59e0b",
    nacelle: "#7f1d1d",
    textColor: "#991b1b",
  },
  VTI: {
    airlineName: "Vistara",
    iataCode: "UK",
    title: "Vistara",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#581c87",
    tailBg: "#4c1d95",
    tailAccent: "#eab308",
    nacelle: "#581c87",
    textColor: "#4c1d95",
  },
  SEJ: {
    airlineName: "SpiceJet",
    iataCode: "SG",
    title: "SpiceJet",
    fuselage: "#dc2626",
    belly: "#991b1b",
    cheatline: "#facc15",
    tailBg: "#b91c1c",
    tailAccent: "#fde047",
    nacelle: "#dc2626",
    textColor: "#ffffff",
  },
  UAE: {
    airlineName: "Emirates",
    iataCode: "EK",
    title: "Emirates",
    fuselage: "#f8fafc",
    belly: "#e2e8f0",
    cheatline: "#ca8a04",
    tailBg: "#b91c1c",
    tailAccent: "#15803d",
    nacelle: "#f8fafc",
    textColor: "#854d0e",
  },
  BAW: {
    airlineName: "British Airways",
    iataCode: "BA",
    title: "BRITISH AIRWAYS",
    fuselage: "#f8fafc",
    belly: "#1e3a8a",
    cheatline: "#dc2626",
    tailBg: "#1e3a8a",
    tailAccent: "#dc2626",
    nacelle: "#1e3a8a",
    textColor: "#1e3a8a",
  },
  UPS: {
    airlineName: "UPS Airlines",
    iataCode: "5X",
    title: "UPS",
    fuselage: "#3b2314",
    belly: "#23150c",
    cheatline: "#ffb500",
    tailBg: "#3b2314",
    tailAccent: "#ffb500",
    nacelle: "#23150c",
    textColor: "#ffb500",
    isCargo: true,
  },
  DHL: {
    airlineName: "DHL Aviation",
    iataCode: "D0",
    title: "DHL",
    fuselage: "#ffcc00",
    belly: "#e6b800",
    cheatline: "#d40511",
    tailBg: "#ffcc00",
    tailAccent: "#d40511",
    nacelle: "#d40511",
    textColor: "#d40511",
    isCargo: true,
  },
  BZP: {
    airlineName: "Blue Dart Aviation",
    iataCode: "BZ",
    title: "BLUE DART",
    fuselage: "#f8fafc",
    belly: "#002b80",
    cheatline: "#d71920",
    tailBg: "#002b80",
    tailAccent: "#d71920",
    nacelle: "#002b80",
    textColor: "#002b80",
    isCargo: true,
  },
  ATN: {
    airlineName: "Amazon Prime Air",
    iataCode: "K4",
    title: "prime air",
    fuselage: "#f8fafc",
    belly: "#232f3e",
    cheatline: "#00a8e1",
    tailBg: "#232f3e",
    tailAccent: "#00a8e1",
    nacelle: "#232f3e",
    textColor: "#232f3e",
    isCargo: true,
  },
  IAF: {
    airlineName: "Indian Air Force",
    iataCode: "IF",
    title: "INDIAN AIR FORCE",
    fuselage: "#94a3b8",
    belly: "#64748b",
    cheatline: "#ea580c",
    tailBg: "#ea580c",
    tailAccent: "#16a34a",
    nacelle: "#475569",
    textColor: "#0f172a",
  },
  RCH: {
    airlineName: "USAF Air Mobility Command",
    iataCode: "MC",
    title: "U.S. AIR FORCE",
    fuselage: "#64748b",
    belly: "#475569",
    cheatline: "#2563eb",
    tailBg: "#334155",
    tailAccent: "#2563eb",
    nacelle: "#334155",
    textColor: "#f8fafc",
  },
  RRR: {
    airlineName: "Royal Air Force",
    iataCode: "RR",
    title: "ROYAL AIR FORCE",
    fuselage: "#94a3b8",
    belly: "#64748b",
    cheatline: "#dc2626",
    tailBg: "#1e3a8a",
    tailAccent: "#dc2626",
    nacelle: "#475569",
    textColor: "#f8fafc",
  },
  NAVY: {
    airlineName: "Indian Naval Air Arm",
    iataCode: "IN",
    title: "INDIAN NAVY",
    fuselage: "#cbd5e1",
    belly: "#1e293b",
    cheatline: "#0284c7",
    tailBg: "#0f172a",
    tailAccent: "#eab308",
    nacelle: "#1e293b",
    textColor: "#0f172a",
  },
  QTR: {
    airlineName: "Qatar Airways",
    iataCode: "QR",
    title: "QATAR",
    fuselage: "#f8fafc",
    belly: "#5c0632",
    cheatline: "#5c0632",
    tailBg: "#5c0632",
    tailAccent: "#e2e8f0",
    nacelle: "#5c0632",
    textColor: "#5c0632",
  },
  SIA: {
    airlineName: "Singapore Airlines",
    iataCode: "SQ",
    title: "SINGAPORE AIRLINES",
    fuselage: "#f8fafc",
    belly: "#002060",
    cheatline: "#eab308",
    tailBg: "#002060",
    tailAccent: "#eab308",
    nacelle: "#002060",
    textColor: "#002060",
  },
  DLH: {
    airlineName: "Lufthansa",
    iataCode: "LH",
    title: "Lufthansa",
    fuselage: "#f8fafc",
    belly: "#05164d",
    cheatline: "#05164d",
    tailBg: "#05164d",
    tailAccent: "#ffab00",
    nacelle: "#05164d",
    textColor: "#05164d",
  },
  AFR: {
    airlineName: "Air France",
    iataCode: "AF",
    title: "AIRFRANCE",
    fuselage: "#f8fafc",
    belly: "#002157",
    cheatline: "#ed0000",
    tailBg: "#002157",
    tailAccent: "#ed0000",
    nacelle: "#f8fafc",
    textColor: "#002157",
  },
  AKJ: {
    airlineName: "Akasa Air",
    iataCode: "QP",
    title: "Akasa Air",
    fuselage: "#f8fafc",
    belly: "#ff4500",
    cheatline: "#4b0082",
    tailBg: "#ff4500",
    tailAccent: "#4b0082",
    nacelle: "#ff4500",
    textColor: "#ff4500",
  },
};

export function hashCallsign(callsign: string): number {
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

export const AIRLINE_PRIMARY_HUBS: Record<string, HubAirportInfo> = {
  BAW: { icao: "EGLL", city: "London", name: "London Heathrow (LHR)" },
  UAE: { icao: "OMDB", city: "Dubai", name: "Dubai Intl (DXB)" },
  FDB: { icao: "OMDB", city: "Dubai", name: "Dubai Intl (DXB)" },
  ETD: { icao: "OMAA", city: "Abu Dhabi", name: "Zayed Intl (AUH)" },
  QTR: { icao: "OTHH", city: "Doha", name: "Hamad Intl (DOH)" },
  SIA: { icao: "WSSS", city: "Singapore", name: "Singapore Changi (SIN)" },
  DLH: { icao: "EDDF", city: "Frankfurt", name: "Frankfurt Main (FRA)" },
  AFR: { icao: "LFPG", city: "Paris", name: "Paris Charles de Gaulle (CDG)" },
  KLM: { icao: "EHAM", city: "Amsterdam", name: "Amsterdam Schiphol (AMS)" },
  THY: { icao: "LTFM", city: "Istanbul", name: "Istanbul Airport (IST)" },
  SVA: { icao: "OERK", city: "Riyadh", name: "King Khalid Intl (RUH)" },
  ABY: { icao: "OMSJ", city: "Sharjah", name: "Sharjah Intl (SHJ)" },
  JZR: { icao: "OKBK", city: "Kuwait", name: "Kuwait Intl (KWI)" },
  KAC: { icao: "OKBK", city: "Kuwait", name: "Kuwait Intl (KWI)" },
  GFA: { icao: "OBBI", city: "Manama", name: "Bahrain Intl (BAH)" },
  OMA: { icao: "OOMS", city: "Muscat", name: "Muscat Intl (MCT)" },
  MAS: { icao: "WMKK", city: "Kuala Lumpur", name: "Kuala Lumpur Intl (KUL)" },
  THA: { icao: "VTBS", city: "Bangkok", name: "Suvarnabhumi (BKK)" },
  CPA: { icao: "VHHH", city: "Hong Kong", name: "Hong Kong Intl (HKG)" },
  ANA: { icao: "RJTT", city: "Tokyo", name: "Tokyo Haneda (HND)" },
  JAL: { icao: "RJTT", city: "Tokyo", name: "Tokyo Haneda (HND)" },
  QFA: { icao: "YSSY", city: "Sydney", name: "Sydney Kingsford Smith (SYD)" },
  KAL: { icao: "RKSI", city: "Seoul", name: "Incheon Intl (ICN)" },
  FDX: { icao: "KMEM", city: "Memphis, TN", name: "Memphis SuperHub (MEM)" },
  UPS: { icao: "KSDF", city: "Louisville, KY", name: "Louisville Worldport (SDF)" },
  BOX: { icao: "EDDP", city: "Leipzig", name: "Leipzig/Halle (LEJ)" },
  CLX: { icao: "ELLX", city: "Luxembourg", name: "Luxembourg Findel (LUX)" },
};

export function pickRemoteHub(
  seed: number,
  excludeAirportIcao: string,
  carrierPrefix = "",
  bearingDeg?: number
): HubAirportInfo {
  const p = carrierPrefix.toUpperCase();

  // If carrier has an authoritative international home hub (and current airport is not that hub)
  if (AIRLINE_PRIMARY_HUBS[p] && AIRLINE_PRIMARY_HUBS[p].icao !== excludeAirportIcao) {
    return AIRLINE_PRIMARY_HUBS[p];
  }

  const isIndianCarrier =
    p === "AIC" || p === "IGO" || p === "AXB" || p === "VTI" || p === "SEJ" || p === "AKJ" || p === "LLR" || p === "SDG" || p === "BZP";
  const isMiddleEast =
    p === "UAE" || p === "FDB" || p === "ETD" || p === "QTR" || p === "SVA" || p === "ABY" || p === "JZR" || p === "KAC" || p === "OMS" || p === "GFA";
  const isEuropean = p === "BAW" || p === "DLH" || p === "AFR" || p === "KLM" || p === "THY" || p === "BOX" || p === "CLX";
  const isAsian = p === "SIA" || p === "MXD" || p === "BBC" || p === "MAS" || p === "THA" || p === "CPA" || p === "ANA" || p === "JAL";

  let pool: HubAirportInfo[];
  if (isMiddleEast || isEuropean || isAsian) {
    pool = REGIONAL_HUBS.INTERNATIONAL;
  } else if (isIndianCarrier || excludeAirportIcao.startsWith("V")) {
    // If geographic bearing is provided, match realistic domestic flight corridors
    if (bearingDeg !== undefined) {
      const b = ((bearingDeg % 360) + 360) % 360;
      if (b >= 315 || b < 45) {
        // North corridors: Delhi, Jaipur, Lucknow, Chandigarh
        pool = [
          { icao: "VIDP", city: "Delhi", name: "Indira Gandhi Intl (DEL)" },
          { icao: "VIJP", city: "Jaipur", name: "Jaipur Intl (JAI)" },
          { icao: "VILK", city: "Lucknow", name: "Chaudhary Charan Singh Intl (LKO)" },
        ];
      } else if (b >= 45 && b < 135) {
        // East / Northeast corridors: Kolkata, Hyderabad, Chennai
        pool = [
          { icao: "VECC", city: "Kolkata", name: "Netaji Subhash Chandra Bose Intl (CCU)" },
          { icao: "VOHS", city: "Hyderabad", name: "Rajiv Gandhi Intl (HYD)" },
          { icao: "VOMM", city: "Chennai", name: "Chennai Intl (MAA)" },
        ];
      } else if (b >= 135 && b < 225) {
        // South corridors: Kochi, Trivandrum, Chennai
        pool = [
          { icao: "VOCI", city: "Kochi", name: "Cochin Intl (COK)" },
          { icao: "VOTV", city: "Thiruvananthapuram", name: "Trivandrum Intl (TRV)" },
          { icao: "VOMM", city: "Chennai", name: "Chennai Intl (MAA)" },
        ];
      } else {
        // West / Northwest corridors: Mumbai, Pune, Ahmedabad, Goa
        pool = [
          { icao: "VABB", city: "Mumbai", name: "Chhatrapati Shivaji Maharaj Intl (BOM)" },
          { icao: "VAPO", city: "Pune", name: "Pune Intl (PNQ)" },
          { icao: "VAAH", city: "Ahmedabad", name: "Sardar Vallabhbhai Patel Intl (AMD)" },
          { icao: "VAGO", city: "Goa", name: "Dabolim Intl (GOI)" },
        ];
      }
    } else {
      pool = REGIONAL_HUBS.INDIA;
    }
  } else {
    pool = REGIONAL_HUBS.US;
  }

  const choices = pool.filter((h) => h.icao !== excludeAirportIcao);
  return choices.length > 0 ? choices[seed % choices.length] : pool[0];
}

export function deriveFlightMetadata(
  callsign: string,
  flightKind: Aircraft["flightKind"],
  airport: { id: AirportId; icao: string; name: string; city: string; country?: string },
  aircraftType: string,
  bearingDeg?: number
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
  const prefix = callsign.slice(0, 3).toUpperCase();
  const remote = pickRemoteHub(h, airport.icao, prefix, bearingDeg);
  const digits = callsign.replace(/\D/g, "") || String(100 + (h % 899));

  // Determine realistic tail registration based on country/carrier prefix
  let registration: string;
  if (prefix === "IAF") {
    registration = `CB-${8000 + (h % 900)}`;
  } else if (prefix === "RCH") {
    registration = `0${8 + (h % 12)}-${digits.padStart(4, "0").slice(-4)}`;
  } else if (prefix === "RRR") {
    registration = `ZZ${170 + (h % 20)}`;
  } else if (prefix === "NAVY") {
    registration = `IN-${700 + (h % 90)}`;
  } else if (
    prefix === "AIC" ||
    prefix === "IGO" ||
    prefix === "AXB" ||
    prefix === "VTI" ||
    prefix === "SEJ" ||
    prefix === "AKJ" ||
    prefix === "BZP" ||
    airport.icao.startsWith("V")
  ) {
    const letters = ["EXA", "IFR", "SPJ", "ATQ", "BLR", "DEL", "BOM", "MAA", "VTI", "KOK"];
    registration = `VT-${letters[h % letters.length].slice(0, 2)}${digits.slice(-1) || "A"}`;
  } else if (prefix === "UAE" || prefix === "FDB" || prefix === "ETD" || prefix === "ABY") {
    registration = `A6-${digits.padStart(3, "E").slice(-3)}`;
  } else if (prefix === "QTR") {
    registration = `A7-${digits.padStart(3, "B").slice(-3)}`;
  } else if (prefix === "SIA") {
    registration = `9V-${digits.padStart(3, "S").slice(-3)}`;
  } else if (prefix === "BAW") {
    registration = `G-B${digits.padStart(3, "W").slice(-3)}`;
  } else if (prefix === "DLH" || prefix === "BOX") {
    registration = `D-A${digits.padStart(3, "I").slice(-3)}`;
  } else if (prefix === "AFR") {
    registration = `F-G${digits.padStart(3, "Z").slice(-3)}`;
  } else if (prefix === "KLM") {
    registration = `PH-${digits.padStart(3, "K").slice(-3)}`;
  } else {
    const suffix = prefix.slice(0, 2) || "AT";
    registration = `N${digits.padStart(3, "4").slice(0, 3)}${suffix}`;
  }

  const levels = ["FL320", "FL340", "FL360", "FL380", "FL390"];
  const cruiseFlightLevel = levels[h % levels.length];

  const isCargo =
    prefix === "FDX" ||
    prefix === "UPS" ||
    prefix === "DHL" ||
    prefix === "BZP" ||
    prefix === "ATN" ||
    aircraftType === "MD11" ||
    aircraftType === "B763" ||
    aircraftType === "B748" ||
    aircraftType === "B77F";
  const isMilitary =
    prefix === "IAF" ||
    prefix === "RCH" ||
    prefix === "RRR" ||
    prefix === "NAVY" ||
    aircraftType === "C17" ||
    aircraftType === "C130" ||
    aircraftType === "A400" ||
    aircraftType === "K35R" ||
    aircraftType === "P8" ||
    aircraftType === "SU30" ||
    aircraftType === "F16";

  const soulsOnBoard = isCargo
    ? `${112 + (h % 65)},000 lbs Freight • 3 Crew`
    : isMilitary
    ? `Tactical Mission Load • ${3 + (h % 3)} Crew`
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
