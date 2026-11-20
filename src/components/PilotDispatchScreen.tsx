import React, { useMemo, useState } from "react";
import {
  PlaneTakeoff,
  Compass,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  Gauge,
  Wind,
  Shield,
  Layers,
  Sparkles,
  MapPin,
  Building,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import { AIRCRAFT_TYPE_SPECS, AIRLINE_LIVERIES } from "../data/aircraftCatalog.ts";
import { calculateAirframeVSpeeds } from "../engine/pilotEngine.ts";
import type { PilotConfig } from "../types/pilot.ts";
import worldSeed from "../data/worldAirportsSeed.json";

// Default recommended popular airports
const POPULAR_AIRPORTS = [
  { icao: "VIDP", iata: "DEL", name: "Indira Gandhi International Airport", city: "New Delhi", country: "India", elev: 777, rwys: "10/28 · 11R/29L · 09/27" },
  { icao: "VOBL", iata: "BLR", name: "Kempegowda International Airport", city: "Bengaluru", country: "India", elev: 3000, rwys: "09L/27R · 09R/27L" },
  { icao: "VABB", iata: "BOM", name: "Chhatrapati Shivaji Maharaj Intl", city: "Mumbai", country: "India", elev: 39, rwys: "09/27 · 14/32" },
  { icao: "OMDB", iata: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", elev: 62, rwys: "12L/30R · 12R/30L" },
  { icao: "EGLL", iata: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", elev: 83, rwys: "09L/27R · 09R/27L" },
  { icao: "KJFK", iata: "JFK", name: "John F. Kennedy International", city: "New York", country: "United States", elev: 13, rwys: "04L/22R · 13L/31R" },
  { icao: "WSSS", iata: "SIN", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", elev: 22, rwys: "02L/20R · 02C/20C" },
  { icao: "VOCI", iata: "COK", name: "Cochin International Airport", city: "Kochi", country: "India", elev: 30, rwys: "09/27" },
];

export function PilotDispatchScreen() {
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const launchPilotFlight = useAtcStore((s) => s.launchPilotFlight);

  // 1. Airport selection
  const [airportSearch, setAirportSearch] = useState("");
  const [selectedAirportIcao, setSelectedAirportIcao] = useState("VOBL");

  // 2. Airframe Model selection
  const [selectedModelCode, setSelectedModelCode] = useState("A20N");

  // 3. Airline selection
  const [selectedAirlineCode, setSelectedAirlineCode] = useState("AIC");

  // 4. Gate Stand & Flight Details
  const [selectedGate, setSelectedGate] = useState("T1_1");
  const [flightNumber, setFlightNumber] = useState("505");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered airports
  const filteredAirports = useMemo(() => {
    const q = airportSearch.trim().toLowerCase();
    if (!q) return POPULAR_AIRPORTS;

    // Search popular first
    const popMatches = POPULAR_AIRPORTS.filter(
      (a) =>
        a.icao.toLowerCase().includes(q) ||
        a.iata.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q)
    );
    if (popMatches.length > 0) return popMatches;

    // Search full seed
    return (worldSeed as Array<{ icao: string; iata: string; name: string; city: string; country: string; elevationFt: number }>)
      .filter(
        (a) =>
          a.icao.toLowerCase().includes(q) ||
          (a.iata && a.iata.toLowerCase().includes(q)) ||
          a.name.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((a) => ({
        icao: a.icao,
        iata: a.iata || a.icao.slice(1),
        name: a.name,
        city: a.city,
        country: a.country,
        elev: a.elevationFt,
        rwys: "Active Centerline",
      }));
  }, [airportSearch]);

  const activeAirport = useMemo(() => {
    return (
      POPULAR_AIRPORTS.find((a) => a.icao === selectedAirportIcao) ||
      (worldSeed as Array<{ icao: string; iata: string; name: string; city: string; country: string; elevationFt: number }>).find(
        (a) => a.icao === selectedAirportIcao
      ) ||
      POPULAR_AIRPORTS[0]
    );
  }, [selectedAirportIcao]);

  // Available Models from catalog
  const availableModels = useMemo(() => {
    return [
      { code: "A20N", name: "Airbus A320neo", maker: "Airbus", pax: "186 pax", cruise: "450 kt", style: "Narrow-body Jet" },
      { code: "A321", name: "Airbus A321-200", maker: "Airbus", pax: "220 pax", cruise: "455 kt", style: "Narrow-body Jet" },
      { code: "A359", name: "Airbus A350-900", maker: "Airbus", pax: "325 pax", cruise: "488 kt", style: "Wide-body Twin" },
      { code: "A388", name: "Airbus A380-800", maker: "Airbus", pax: "525 pax", cruise: "490 kt", style: "Super Heavy Double-Deck" },
      { code: "B38M", name: "Boeing 737 MAX 8", maker: "Boeing", pax: "178 pax", cruise: "453 kt", style: "Narrow-body Jet" },
      { code: "B738", name: "Boeing 737-800", maker: "Boeing", pax: "162 pax", cruise: "448 kt", style: "Narrow-body Jet" },
      { code: "B77W", name: "Boeing 777-300ER", maker: "Boeing", pax: "396 pax", cruise: "482 kt", style: "Wide-body Heavy" },
      { code: "B789", name: "Boeing 789 Dreamliner", maker: "Boeing", pax: "290 pax", cruise: "488 kt", style: "Wide-body Carbon" },
      { code: "B748", name: "Boeing 747-8 Intercontinental", maker: "Boeing", pax: "467 pax", cruise: "493 kt", style: "Jumbo Quad-Jet" },
      { code: "AT76", name: "ATR 72-600", maker: "ATR", pax: "72 pax", cruise: "275 kt", style: "Regional Turboprop" },
      { code: "DH8D", name: "De Havilland Dash 8 Q400", maker: "Bombardier", pax: "78 pax", cruise: "360 kt", style: "High-Speed Turboprop" },
    ];
  }, []);

  const activeModel = useMemo(() => {
    return availableModels.find((m) => m.code === selectedModelCode) || availableModels[0];
  }, [availableModels, selectedModelCode]);

  // Available Airlines
  const availableAirlines = useMemo(() => {
    return [
      { code: "AIC", name: "Air India", callsignPrefix: "Air India", regPrefix: "VT-", color: "#e11d48", country: "India" },
      { code: "IGO", name: "IndiGo", callsignPrefix: "IndiGo", regPrefix: "VT-", color: "#2563eb", country: "India" },
      { code: "BAW", name: "British Airways", callsignPrefix: "Speedbird", regPrefix: "G-", color: "#1e3a8a", country: "United Kingdom" },
      { code: "DLH", name: "Lufthansa", callsignPrefix: "Lufthansa", regPrefix: "D-", color: "#d97706", country: "Germany" },
      { code: "UAE", name: "Emirates", callsignPrefix: "Emirates", regPrefix: "A6-", color: "#dc2626", country: "UAE" },
      { code: "SIA", name: "Singapore Airlines", callsignPrefix: "Singapore", regPrefix: "9V-", color: "#ca8a04", country: "Singapore" },
      { code: "QTR", name: "Qatar Airways", callsignPrefix: "Qatari", regPrefix: "A7-", color: "#831843", country: "Qatar" },
      { code: "VTI", name: "Vistara", callsignPrefix: "Vistara", regPrefix: "VT-", color: "#581c87", country: "India" },
      { code: "SEJ", name: "SpiceJet", callsignPrefix: "SpiceJet", regPrefix: "VT-", color: "#ea580c", country: "India" },
      { code: "AFR", name: "Air France", callsignPrefix: "Airfrans", regPrefix: "F-", color: "#0284c7", country: "France" },
      { code: "UAL", name: "United Airlines", callsignPrefix: "United", regPrefix: "N", color: "#0284c7", country: "USA" },
      { code: "DAL", name: "Delta Air Lines", callsignPrefix: "Delta", regPrefix: "N", color: "#b91c1c", country: "USA" },
    ];
  }, []);

  const activeAirline = useMemo(() => {
    return availableAirlines.find((a) => a.code === selectedAirlineCode) || availableAirlines[0];
  }, [availableAirlines, selectedAirlineCode]);

  // V-speeds calculation
  const vSpeeds = useMemo(() => {
    return calculateAirframeVSpeeds(selectedModelCode);
  }, [selectedModelCode]);

  // Registration & Callsign
  const callsign = `${activeAirline.code}${flightNumber}`;
  const registration = `${activeAirline.regPrefix}${selectedModelCode.slice(0, 2)}${flightNumber.slice(-2)}`;

  // Launch Flight handler
  const handleLaunchFlight = async () => {
    setIsSubmitting(true);
    const config: PilotConfig = {
      airportIcao: activeAirport.icao,
      airportName: activeAirport.name,
      modelCode: activeModel.code,
      modelName: activeModel.name,
      airlineCode: activeAirline.code,
      airlineName: activeAirline.name,
      callsign,
      flightNumber,
      registration,
      gateId: selectedGate,
      targetRunway: "09L",
      destinationIcao: activeAirport.icao === "VIDP" ? "VOBL" : "VIDP",
      destinationName: activeAirport.icao === "VIDP" ? "Kempegowda Intl" : "Indira Gandhi Intl",
      v1Speed: vSpeeds.v1,
      vrSpeed: vSpeeds.vr,
      v2Speed: vSpeeds.v2,
      cruiseAltitude: 34000,
    };

    try {
      await launchPilotFlight(config);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[var(--atc-bg)] text-[var(--atc-text)] flex flex-col overflow-y-auto select-none">
      {/* 1. TOP HEADER */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--atc-border)] bg-[var(--atc-panel)]/95 backdrop-blur-md px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAppMode("LANDING")}
            className="p-2 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)] hover:text-[var(--atc-text)] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-mono"
            title="Return to Main Menu"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] flex items-center justify-center text-[var(--atc-emerald)]">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black font-mono tracking-wider uppercase text-[var(--atc-text)]">
                  PILOT DISPATCH & BRIEFING
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-[var(--atc-emerald)] text-black">
                  PHASE 1
                </span>
              </div>
              <p className="text-[11px] text-[var(--atc-muted)] font-mono">
                Select departure airfield, airframe type, airline livery, and gate stand
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLaunchFlight}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-[var(--atc-emerald)] hover:opacity-95 text-black font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <PlaneTakeoff className="w-4 h-4" />
            <span>Enter Cockpit</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN SETUP CONTENT GRID */}
      <main className="max-w-6xl w-full mx-auto p-6 sm:p-8 space-y-8 flex-1">
        {/* Banner Alert */}
        <div className="rounded-xl border border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)]/30 p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[var(--atc-emerald)] shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold font-mono text-[var(--atc-emerald)] uppercase">
              Phase 1 Direct Cockpit Simulation (Max 2 Aircraft Constraint)
            </div>
            <div className="text-xs text-[var(--atc-text-secondary)] font-sans mt-0.5">
              You will command the aircraft directly from the flight deck—requesting IFR delivery, engine start, pushback, taxi, and takeoff clearances from the autonomous ATC tower. Exactly 1 background AI aircraft will share the airspace.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT 2 COLUMNS: DISPATCH FORM */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Airport Dropdown / Search */}
            <div className="rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-panel)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] flex items-center justify-center font-mono font-bold text-xs">
                    1
                  </div>
                  <h3 className="text-sm font-extrabold font-mono uppercase text-[var(--atc-text)]">
                    Departure Airfield
                  </h3>
                </div>
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--atc-muted)]" />
                  <input
                    type="text"
                    value={airportSearch}
                    onChange={(e) => setAirportSearch(e.target.value)}
                    placeholder="Search ICAO or city..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded-lg text-[var(--atc-text)] focus:outline-none focus:border-[var(--atc-cyan)]"
                  />
                </div>
              </div>

              {/* Airport Grid Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {filteredAirports.map((ap) => {
                  const isSelected = ap.icao === selectedAirportIcao;
                  return (
                    <div
                      key={ap.icao}
                      onClick={() => setSelectedAirportIcao(ap.icao)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "border-[var(--atc-cyan)] bg-[var(--atc-cyan-bg)] text-[var(--atc-text)]"
                          : "border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)]"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-[var(--atc-cyan)]">
                            {ap.icao}
                          </span>
                          <span className="text-[10px] font-mono px-1 rounded bg-[var(--atc-surface)] text-[var(--atc-muted)]">
                            {ap.iata}
                          </span>
                        </div>
                        <div className="text-xs font-medium truncate mt-0.5 text-[var(--atc-text)]">
                          {ap.city}
                        </div>
                        <div className="text-[10px] text-[var(--atc-muted)] font-mono">
                          Elev: {ap.elev} ft
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-[var(--atc-cyan)] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Aircraft Model */}
            <div className="rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-panel)] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] flex items-center justify-center font-mono font-bold text-xs">
                  2
                </div>
                <h3 className="text-sm font-extrabold font-mono uppercase text-[var(--atc-text)]">
                  Aircraft Airframe Model
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {availableModels.map((m) => {
                  const isSelected = m.code === selectedModelCode;
                  return (
                    <div
                      key={m.code}
                      onClick={() => setSelectedModelCode(m.code)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "border-[var(--atc-emerald)] bg-[var(--atc-emerald-bg)] text-[var(--atc-text)]"
                          : "border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-[var(--atc-emerald)]">
                            {m.code}
                          </span>
                          <span className="text-[10px] font-mono text-[var(--atc-muted)]">
                            · {m.maker}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--atc-text)] mt-0.5">
                          {m.name}
                        </div>
                        <div className="text-[10px] text-[var(--atc-muted)] font-mono">
                          {m.style} · {m.pax}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-[var(--atc-emerald)] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Airline & Livery */}
            <div className="rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-panel)] p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] flex items-center justify-center font-mono font-bold text-xs">
                  3
                </div>
                <h3 className="text-sm font-extrabold font-mono uppercase text-[var(--atc-text)]">
                  Airline & Fleet Livery
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {availableAirlines.map((al) => {
                  const isSelected = al.code === selectedAirlineCode;
                  return (
                    <div
                      key={al.code}
                      onClick={() => setSelectedAirlineCode(al.code)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                        isSelected
                          ? "border-[var(--atc-amber)] bg-[var(--atc-amber-bg)] text-[var(--atc-text)]"
                          : "border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] text-[var(--atc-text-secondary)]"
                      }`}
                    >
                      <div
                        className="w-3.5 h-7 rounded-sm shrink-0 border border-black/20"
                        style={{ backgroundColor: al.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate text-[var(--atc-text)]">
                          {al.name}
                        </div>
                        <div className="text-[10px] text-[var(--atc-muted)] font-mono">
                          {al.code} · {al.country}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: FLIGHT DISPATCH SUMMARY & V-SPEEDS */}
          <div className="space-y-6">
            {/* Flight Strip Dispatch Card */}
            <div className="rounded-2xl border-2 border-[var(--atc-accent-border)] bg-[var(--atc-panel)] p-5 shadow-lg space-y-5">
              <div className="flex items-center justify-between border-b border-[var(--atc-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--atc-accent)]" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--atc-text)]">
                    DISPATCH FLIGHT STRIP
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--atc-surface)] text-[var(--atc-accent)] border border-[var(--atc-border)]">
                  {callsign}
                </span>
              </div>

              {/* Callsign & Reg */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)]">
                  <span className="text-[10px] text-[var(--atc-muted)] block uppercase">Radiotelephony</span>
                  <span className="font-bold text-[var(--atc-text)]">{activeAirline.callsignPrefix} {flightNumber}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)]">
                  <span className="text-[10px] text-[var(--atc-muted)] block uppercase">Tail Registration</span>
                  <span className="font-bold text-[var(--atc-text)]">{registration}</span>
                </div>
              </div>

              {/* Gate Assignment */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold uppercase text-[var(--atc-muted)] flex items-center gap-1">
                  <Building className="w-3.5 h-3.5" />
                  Gate Stand Assignment
                </label>
                <select
                  value={selectedGate}
                  onChange={(e) => setSelectedGate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded-xl text-[var(--atc-text)] focus:outline-none focus:border-[var(--atc-accent)]"
                >
                  <option value="T1_1">Gate T1_1 (Terminal Stand 1)</option>
                  <option value="T1_2">Gate T1_2 (Terminal Stand 2)</option>
                  <option value="T1_3">Gate T1_3 (Terminal Stand 3)</option>
                  <option value="T1_4">Gate T1_4 (Terminal Stand 4)</option>
                  <option value="T1_5">Gate T1_5 (Terminal Stand 5)</option>
                  <option value="GATE_1">Gate 1 (Main Apron)</option>
                  <option value="GATE_2">Gate 2 (Main Apron)</option>
                </select>
              </div>

              {/* Flight Number Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-semibold uppercase text-[var(--atc-muted)]">
                  Flight Number Digits
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-3 py-2 text-xs font-mono bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded-xl text-[var(--atc-text)] focus:outline-none focus:border-[var(--atc-accent)]"
                  placeholder="505"
                />
              </div>

              {/* Computed V-Speeds Panel */}
              <div className="p-4 rounded-xl bg-[var(--atc-surface)] border border-[var(--atc-border)] space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[var(--atc-text)] uppercase">
                  <Gauge className="w-4 h-4 text-[var(--atc-cyan)]" />
                  <span>Computed Takeoff V-Speeds</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded bg-[var(--atc-panel)] border border-[var(--atc-border)]">
                    <span className="text-[10px] text-[var(--atc-muted)] block">V1 Decision</span>
                    <span className="text-base font-extrabold text-[var(--atc-cyan)]">{vSpeeds.v1} <span className="text-[10px] font-normal">kt</span></span>
                  </div>
                  <div className="p-2 rounded bg-[var(--atc-panel)] border border-[var(--atc-border)]">
                    <span className="text-[10px] text-[var(--atc-muted)] block">VR Rotate</span>
                    <span className="text-base font-extrabold text-[var(--atc-emerald)]">{vSpeeds.vr} <span className="text-[10px] font-normal">kt</span></span>
                  </div>
                  <div className="p-2 rounded bg-[var(--atc-panel)] border border-[var(--atc-border)]">
                    <span className="text-[10px] text-[var(--atc-muted)] block">V2 Safety</span>
                    <span className="text-base font-extrabold text-pink-400">{vSpeeds.v2} <span className="text-[10px] font-normal">kt</span></span>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--atc-muted)] font-mono leading-tight">
                  Synthetic voice callout engine triggers automated calls at 80 kt, V1, VR ("Rotate"), and liftoff ("Positive rate, gear up").
                </div>
              </div>

              {/* Primary CTA */}
              <button
                onClick={handleLaunchFlight}
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-[var(--atc-emerald)] hover:opacity-95 text-black font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer"
              >
                <PlaneTakeoff className="w-5 h-5" />
                <span>Enter Cockpit & Prepare Flight</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
