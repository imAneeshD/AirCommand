import React, { useMemo, useState } from "react";
import {
  Compass,
  Globe2,
  Headphones,
  Mic,
  Moon,
  Play,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Volume2,
  VolumeX,
  Wind,
  Zap,
  ArrowRight,
  PlaneTakeoff,
  Clock,
  Layers,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { AIRPORT_CATALOG, createAirportById } from "../data/asteriaAirport.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { AirportId, AirportRecord, PlayerRoleMode, ScenarioId } from "../types/atc.ts";
import { offlineDb } from "../utils/offlineDb.ts";
import { radioAudio } from "../utils/radioAudio.ts";

interface FeaturedAirportItem {
  id: string;
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  category: "INTERNATIONAL" | "DOMESTIC" | "TRAINING";
  runwaySummary: string;
  runwayCount: number;
  elevationFt: number;
  difficulty: "STANDARD" | "INTERMEDIATE" | "CHALLENGING" | "EXPERT";
  windLabel: string;
  isLegacy?: boolean;
}

const FEATURED_AIRPORTS: FeaturedAirportItem[] = [
  {
    id: "VOBL",
    icao: "VOBL",
    iata: "BLR",
    name: "Kempegowda International Airport",
    city: "Bengaluru",
    country: "India",
    category: "INTERNATIONAL",
    runwaySummary: "09L/27R · 09R/27L",
    runwayCount: 2,
    elevationFt: 3000,
    difficulty: "CHALLENGING",
    windLabel: "090° / 09 kt",
  },
  {
    id: "VIDP",
    icao: "VIDP",
    iata: "DEL",
    name: "Indira Gandhi International Airport",
    city: "New Delhi",
    country: "India",
    category: "INTERNATIONAL",
    runwaySummary: "11L/29R · 11R/29L · 10/28 · 09/27",
    runwayCount: 4,
    elevationFt: 777,
    difficulty: "EXPERT",
    windLabel: "290° / 12 kt",
  },
  {
    id: "VABB",
    icao: "VABB",
    iata: "BOM",
    name: "Chhatrapati Shivaji Maharaj Intl",
    city: "Mumbai",
    country: "India",
    category: "INTERNATIONAL",
    runwaySummary: "09/27 · 14/32 (Intersecting)",
    runwayCount: 2,
    elevationFt: 39,
    difficulty: "EXPERT",
    windLabel: "270° / 14 kt",
  },
  {
    id: "OMDB",
    icao: "OMDB",
    iata: "DXB",
    name: "Dubai International Airport",
    city: "Dubai",
    country: "United Arab Emirates",
    category: "INTERNATIONAL",
    runwaySummary: "12L/30R · 12R/30L",
    runwayCount: 2,
    elevationFt: 62,
    difficulty: "CHALLENGING",
    windLabel: "120° / 08 kt",
  },
  {
    id: "WSSS",
    icao: "WSSS",
    iata: "SIN",
    name: "Singapore Changi Airport",
    city: "Singapore",
    country: "Singapore",
    category: "INTERNATIONAL",
    runwaySummary: "02L/20R · 02C/20C",
    runwayCount: 2,
    elevationFt: 22,
    difficulty: "CHALLENGING",
    windLabel: "020° / 10 kt",
  },
  {
    id: "EGLL",
    icao: "EGLL",
    iata: "LHR",
    name: "London Heathrow Airport",
    city: "London",
    country: "United Kingdom",
    category: "INTERNATIONAL",
    runwaySummary: "09L/27R · 09R/27L",
    runwayCount: 2,
    elevationFt: 83,
    difficulty: "EXPERT",
    windLabel: "270° / 15 kt",
  },
  {
    id: "KJFK",
    icao: "KJFK",
    iata: "JFK",
    name: "John F. Kennedy International Airport",
    city: "New York",
    country: "United States",
    category: "INTERNATIONAL",
    runwaySummary: "04L/22R · 04R/22L · 13L/31R",
    runwayCount: 4,
    elevationFt: 13,
    difficulty: "EXPERT",
    windLabel: "220° / 11 kt",
  },
  {
    id: "VOHS",
    icao: "VOHS",
    iata: "HYD",
    name: "Rajiv Gandhi International Airport",
    city: "Hyderabad",
    country: "India",
    category: "INTERNATIONAL",
    runwaySummary: "09L/27R · 09R/27L",
    runwayCount: 2,
    elevationFt: 2024,
    difficulty: "INTERMEDIATE",
    windLabel: "090° / 07 kt",
  },
  {
    id: "VOMM",
    icao: "VOMM",
    iata: "MAA",
    name: "Chennai International Airport",
    city: "Chennai",
    country: "India",
    category: "INTERNATIONAL",
    runwaySummary: "07/25 · 12/30",
    runwayCount: 2,
    elevationFt: 52,
    difficulty: "INTERMEDIATE",
    windLabel: "070° / 10 kt",
  },
  {
    id: "VOGA",
    icao: "VOGA",
    iata: "GOX",
    name: "Manohar International Airport (Mopa)",
    city: "Goa",
    country: "India",
    category: "DOMESTIC",
    runwaySummary: "10/28 (Single RWY)",
    runwayCount: 1,
    elevationFt: 554,
    difficulty: "STANDARD",
    windLabel: "100° / 06 kt",
  },
  {
    id: "KAST",
    icao: "KAST",
    iata: "AST",
    name: "Asteria International (Training Field)",
    city: "Asteria Metro",
    country: "United States",
    category: "TRAINING",
    runwaySummary: "09L/27R · 09R/27L",
    runwayCount: 2,
    elevationFt: 840,
    difficulty: "STANDARD",
    windLabel: "090° / 08 kt",
    isLegacy: true,
  },
  {
    id: "KMRD",
    icao: "KMRD",
    iata: "MRD",
    name: "Meridian Cargo Hub",
    city: "Meridian Valley",
    country: "United States",
    category: "TRAINING",
    runwaySummary: "27L/09R · 27R/09L",
    runwayCount: 2,
    elevationFt: 620,
    difficulty: "INTERMEDIATE",
    windLabel: "270° / 11 kt",
    isLegacy: true,
  },
  {
    id: "KVEL",
    icao: "KVEL",
    iata: "VEL",
    name: "Velora Alpine Regional",
    city: "Velora Pass",
    country: "United States",
    category: "TRAINING",
    runwaySummary: "14/32 (Single RWY)",
    runwayCount: 1,
    elevationFt: 5280,
    difficulty: "CHALLENGING",
    windLabel: "140° / 12 kt",
    isLegacy: true,
  },
  {
    id: "KSOL",
    icao: "KSOL",
    iata: "SOL",
    name: "Solaris Midfield Hub",
    city: "Solaris Central",
    country: "United States",
    category: "TRAINING",
    runwaySummary: "09/27 · 04/22",
    runwayCount: 2,
    elevationFt: 1120,
    difficulty: "CHALLENGING",
    windLabel: "090° / 10 kt",
    isLegacy: true,
  },
];

const SCENARIOS: Array<{ id: ScenarioId; label: string; desc: string }> = [
  { id: "NORMAL_OPS", label: "Normal Operations", desc: "Balanced arrivals and departures" },
  { id: "LIGHT", label: "Light Traffic", desc: "Calm flow, ideal for relaxed controlling" },
  { id: "RUSH_HOUR", label: "Peak Rush Hour", desc: "Heavy arrival banks and taxi queues" },
  { id: "EMERGENCY", label: "Emergency & Radio Loss", desc: "7700 squawks, engine failures, ARFF dispatch" },
  { id: "LOW_TRAFFIC", label: "Low Traffic / Training", desc: "Minimal aircraft, step-by-step practice" },
];

const ROLES: Array<{ id: PlayerRoleMode; label: string; badge: string; desc: string }> = [
  {
    id: "ALL",
    label: "ALL AUTO",
    badge: "Recommended",
    desc: "AI automates all 5 stations. Watch traffic or take manual command anytime.",
  },
  {
    id: "GROUND",
    label: "GROUND (G)",
    badge: "Surface",
    desc: "Manage pushbacks, taxi clearances, and runway crossings.",
  },
  {
    id: "TOWER",
    label: "TOWER (T)",
    badge: "Runways",
    desc: "Issue line-up, takeoff, landing clearances, and go-arounds.",
  },
  {
    id: "DEPARTURE",
    label: "DEP / APP (D)",
    badge: "Radar",
    desc: "Direct radar vectors, climbs, speed targets, and ILS approaches.",
  },
  {
    id: "DELIVERY",
    label: "DELIVERY",
    badge: "Clearance",
    desc: "Review filed IFR flight plans and issue departure clearances.",
  },
];

function difficultyBadge(diff: string): string {
  switch (diff) {
    case "STANDARD":
      return "bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border-[var(--atc-emerald-border)]";
    case "INTERMEDIATE":
      return "bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] border-[var(--atc-cyan-border)]";
    case "CHALLENGING":
      return "bg-[var(--atc-amber-bg)] text-[var(--atc-amber)] border-[var(--atc-amber-border)]";
    default:
      return "bg-[var(--atc-red-bg)] text-[var(--atc-red)] border-[var(--atc-red-border)]";
  }
}

export const LandingPage: React.FC = () => {
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const sim = useAtcStore((s) => s.sim);
  const theme = useAtcStore((s) => s.theme);
  const toggleTheme = useAtcStore((s) => s.toggleTheme);
  const voiceEnabled = useAtcStore((s) => s.voiceEnabled);
  const toggleVoice = useAtcStore((s) => s.toggleVoice);
  const savedAirportId = useAtcStore((s) => s.savedAirportId);
  const hasActiveSession = useAtcStore((s) => s.hasActiveSession);
  const selectAndSaveAirport = useAtcStore((s) => s.selectAndSaveAirport);
  const launchRealAirportSimulation = useAtcStore((s) => s.launchRealAirportSimulation);
  const setShowVerificationModal = useAtcStore((s) => s.setShowVerificationModal);
  const removeLocalOfflineMap = useAtcStore((s) => s.removeLocalOfflineMap);

  const [selectedAirportId, setSelectedAirportId] = useState<string>(
    savedAirportId || sim.airport.icao || "VOBL"
  );
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(sim.scenarioId || "NORMAL_OPS");
  const [selectedRole, setSelectedRole] = useState<PlayerRoleMode>(
    sim.config?.activePlayerStation || "ALL"
  );
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categoryTab, setCategoryTab] = useState<"ALL" | "INTERNATIONAL" | "INDIA" | "TRAINING">("ALL");
  const [isLaunching, setIsLaunching] = useState<boolean>(false);

  const isLight = theme === "light";

  // Filter airports by search and category
  const filteredAirports = useMemo(() => {
    return FEATURED_AIRPORTS.filter((a) => {
      if (categoryTab === "INDIA" && a.country !== "India") return false;
      if (categoryTab === "TRAINING" && !a.isLegacy) return false;
      if (categoryTab === "INTERNATIONAL" && (a.category !== "INTERNATIONAL" || a.isLegacy)) return false;

      if (!searchFilter.trim()) return true;
      const q = searchFilter.trim().toUpperCase();
      return (
        a.icao.includes(q) ||
        a.iata.includes(q) ||
        a.name.toUpperCase().includes(q) ||
        a.city.toUpperCase().includes(q) ||
        a.country.toUpperCase().includes(q)
      );
    });
  }, [categoryTab, searchFilter]);

  const activeSelectedAirport = useMemo(() => {
    return (
      FEATURED_AIRPORTS.find((a) => a.id === selectedAirportId) ??
      FEATURED_AIRPORTS[0]
    );
  }, [selectedAirportId]);

  // Execute redirection to game
  const handleLaunchGame = async (airportIdToLaunch?: string) => {
    const targetId = airportIdToLaunch || selectedAirportId;
    setIsLaunching(true);

    try {
      radioAudio.stopAllSpeech();

      // Check if it's one of the legacy training airfields
      const legacyItem = FEATURED_AIRPORTS.find((a) => a.id === targetId && a.isLegacy);
      if (legacyItem) {
        selectAndSaveAirport(targetId as AirportId, selectedScenario, selectedRole);
        return;
      }

      // Check bundled real airport
      const bundled = offlineDb.getBundledFallbackAirport(targetId);
      if (bundled) {
        await launchRealAirportSimulation(bundled, selectedScenario, selectedRole);
        return;
      }

      // Fallback to selectAndSaveAirport
      selectAndSaveAirport(targetId as AirportId, selectedScenario, selectedRole);
    } finally {
      setIsLaunching(false);
    }
  };

  // Resume current active session
  const handleResumeCurrentSession = () => {
    setAppMode("SIMULATION");
  };

  const sessionMinutes = Math.floor(sim.time / 60);
  const sessionSeconds = Math.floor(sim.time % 60);
  const sessionTimeFormatted = `T+${String(sessionMinutes).padStart(2, "0")}:${String(sessionSeconds).padStart(2, "0")}`;

  return (
    <div className="min-h-screen w-screen bg-[var(--atc-bg)] text-[var(--atc-text)] flex flex-col overflow-y-auto selection:bg-[var(--atc-accent)] selection:text-black">
      {/* 1. STICKY TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--atc-border)] bg-[var(--atc-panel)]/95 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between gap-4 transition-colors">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)] shadow-sm shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wider text-[var(--atc-text)] uppercase font-mono leading-none">
                AIRCOMMAND
              </h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)] border border-[var(--atc-emerald-border)]">
                v2.4 LIVE
              </span>
            </div>
            <p className="text-[11px] text-[var(--atc-muted)] font-mono leading-tight mt-0.5">
              Air Traffic Control Simulation System
            </p>
          </div>
        </div>

        {/* Center Quick Nav */}
        <nav className="hidden lg:flex items-center gap-1.5 text-xs font-mono font-semibold text-[var(--atc-muted)]">
          <button
            onClick={() => {
              const el = document.getElementById("airports-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 rounded-lg hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)] transition-colors"
          >
            Airports
          </button>
          <button
            onClick={() => {
              const el = document.getElementById("configuration-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 rounded-lg hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)] transition-colors"
          >
            Controller Roles
          </button>
          <button
            onClick={() => {
              const el = document.getElementById("features-section");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-3 py-1.5 rounded-lg hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface)] transition-colors"
          >
            How To Play
          </button>
          <button
            onClick={() => setAppMode("GLOBAL_MAP")}
            className="px-3 py-1.5 rounded-lg hover:text-[var(--atc-cyan)] hover:bg-[var(--atc-cyan-bg)] flex items-center gap-1 transition-colors"
          >
            <Globe2 className="w-3.5 h-3.5" />
            World Map (1,266)
          </button>
          <button
            onClick={() => setAppMode("MULTIPLAYER_LOBBY")}
            className="px-3 py-1.5 rounded-lg hover:text-[var(--atc-amber)] hover:bg-[var(--atc-amber-bg)] flex items-center gap-1 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            Multiplayer
          </button>
        </nav>

        {/* Right Tools & Primary CTA */}
        <div className="flex items-center gap-2">
          {/* Audio toggle */}
          <button
            onClick={toggleVoice}
            title={voiceEnabled ? "Mute ATC & Pilot Voice Audio (M)" : "Enable ATC & Pilot Voice Audio (M)"}
            className={`p-2 rounded-lg border text-xs font-mono transition-colors ${
              voiceEnabled
                ? "border-[var(--atc-emerald-border)] bg-[var(--atc-emerald-bg)] text-[var(--atc-emerald)]"
                : "border-[var(--atc-border)] bg-[var(--atc-surface)] text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isLight ? "Switch to Dark Radar Theme" : "Switch to Light Chart Theme"}
            className="p-2 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] text-xs transition-colors"
          >
            {isLight ? <Moon className="w-4 h-4 text-indigo-500" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Rules Verification */}
          <button
            onClick={() => setShowVerificationModal(true)}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-xs font-mono font-medium text-[var(--atc-text-secondary)] transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--atc-emerald)]" />
            <span>Rules</span>
          </button>

          {/* Primary Action Button */}
          <button
            onClick={() => handleLaunchGame()}
            disabled={isLaunching}
            className="px-4 py-2 rounded-xl bg-[var(--atc-accent)] hover:opacity-95 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[var(--atc-shadow)] border border-[var(--atc-accent-border)] transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Launch Game</span>
            <span className="sm:hidden">Play</span>
          </button>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="relative w-full border-b border-[var(--atc-border)] bg-gradient-to-b from-[var(--atc-panel)] via-[var(--atc-surface)] to-[var(--atc-bg)] py-12 px-6 sm:px-10">
        <div className="max-w-6xl mx-auto flex flex-col items-center text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--atc-accent-border)] bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] text-xs font-mono font-bold uppercase tracking-wider mb-5 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-[var(--atc-accent)]" />
            <span>FAA / ICAO Clearance-Gated Air Traffic Simulator</span>
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-[var(--atc-text)] font-mono uppercase max-w-4xl leading-tight">
            Command The Airspace. Master The Tower.
          </h2>

          {/* Subtitle */}
          <p className="mt-4 text-sm sm:text-base text-[var(--atc-text-secondary)] max-w-2xl font-sans leading-relaxed">
            Direct real departures and arrivals, issue clearance-gated instructions, experience authentic pilot voice readbacks with speech recognition PTT, and manage complex multi-runway flows in real time.
          </p>

          {/* Active Session Quick-Resume Banner */}
          {hasActiveSession && sim.airport && (
            <div className="mt-8 w-full max-w-2xl rounded-2xl border-2 border-[var(--atc-accent-border)] bg-[var(--atc-panel)] p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
              <div className="text-left flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)] shrink-0">
                  <PlaneTakeoff className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-[var(--atc-accent-text)] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Active Session In Progress
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--atc-surface)] text-[var(--atc-cyan)] border border-[var(--atc-border)]">
                      {sessionTimeFormatted}
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-[var(--atc-text)] mt-0.5 font-mono">
                    {sim.airport.icao} · {sim.airport.name}
                  </div>
                  <div className="text-xs text-[var(--atc-muted)] font-mono">
                    Station: {sim.config.activePlayerStation === "ALL" ? "ALL AUTO" : sim.config.activePlayerStation} • {sim.aircraftOrder.length} Aircraft Active
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={handleResumeCurrentSession}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[var(--atc-accent)] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 shadow-md transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Resume Session
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Button Group */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleLaunchGame()}
              disabled={isLaunching}
              className="px-6 py-3.5 rounded-xl bg-[var(--atc-accent)] hover:opacity-95 text-slate-950 font-mono font-extrabold text-sm uppercase tracking-wider flex items-center gap-2.5 shadow-lg border border-[var(--atc-accent-border)] transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch {activeSelectedAirport.icao} ({selectedRole === "ALL" ? "ALL AUTO" : selectedRole})</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setAppMode("GLOBAL_MAP")}
              className="px-4 py-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] font-mono font-semibold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Globe2 className="w-4 h-4 text-[var(--atc-cyan)]" />
              <span>World Map (1,266 Airports)</span>
            </button>

            <button
              onClick={() => setAppMode("MULTIPLAYER_LOBBY")}
              className="px-4 py-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] font-mono font-semibold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Users className="w-4 h-4 text-[var(--atc-amber)]" />
              <span>Multiplayer (5 Roles)</span>
            </button>

            <button
              onClick={() => setAppMode("LIVE_OBSERVATION")}
              className="px-4 py-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] font-mono font-semibold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Radio className="w-4 h-4 text-[var(--atc-emerald)]" />
              <span>Live ADS-B Radar</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-4xl text-left">
            <div className="p-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-sm">
              <div className="text-[10px] font-mono uppercase text-[var(--atc-muted)]">Global Database</div>
              <div className="text-xl font-mono font-extrabold text-[var(--atc-cyan)] mt-0.5">1,266 Airports</div>
              <div className="text-[11px] text-[var(--atc-text-secondary)] mt-0.5">Real OSM runways & gates</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-sm">
              <div className="text-[10px] font-mono uppercase text-[var(--atc-muted)]">ATC Positions</div>
              <div className="text-xl font-mono font-extrabold text-[var(--atc-emerald)] mt-0.5">5 Stations</div>
              <div className="text-[11px] text-[var(--atc-text-secondary)] mt-0.5">DEL · GND · TWR · DEP · ACC</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-sm">
              <div className="text-[10px] font-mono uppercase text-[var(--atc-muted)]">Voice & Comms</div>
              <div className="text-xl font-mono font-extrabold text-[var(--atc-accent-text)] mt-0.5">Web Speech PTT</div>
              <div className="text-[11px] text-[var(--atc-text-secondary)] mt-0.5">Natural voice & readbacks</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-sm">
              <div className="text-[10px] font-mono uppercase text-[var(--atc-muted)]">Traffic Feeds</div>
              <div className="text-xl font-mono font-extrabold text-[var(--atc-amber)] mt-0.5">Live ADS-B</div>
              <div className="text-[11px] text-[var(--atc-text-secondary)] mt-0.5">Real aircraft in the airspace</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. AIRPORT SELECTION SECTION */}
      <section id="airports-section" className="w-full max-w-6xl mx-auto px-6 sm:px-10 py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[var(--atc-accent)] tracking-wider">
              <Compass className="w-4 h-4" />
              <span>Airfield Roster</span>
            </div>
            <h3 className="text-2xl font-mono font-extrabold text-[var(--atc-text)] mt-1">
              Select Your Airport Hub
            </h3>
            <p className="text-xs text-[var(--atc-muted)] font-sans mt-0.5">
              Click any airport to select it, or click Launch to immediately enter the radar simulation.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--atc-muted)]" />
            <input
              type="text"
              placeholder="Search ICAO, IATA, City..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-[var(--atc-surface)] border border-[var(--atc-border)] rounded-xl text-[var(--atc-text)] placeholder-[var(--atc-muted)] focus:outline-none focus:border-[var(--atc-accent-border)] transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--atc-border)] pb-3">
          {(
            [
              { id: "ALL", label: "All Featured Hubs" },
              { id: "INDIA", label: "Indian Hubs (VOBL, VIDP, VABB...)" },
              { id: "INTERNATIONAL", label: "International (Dubai, London, Singapore...)" },
              { id: "TRAINING", label: "Phase 1 Training Fields (Asteria...)" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategoryTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                categoryTab === tab.id
                  ? "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]"
                  : "bg-[var(--atc-surface)] text-[var(--atc-muted)] hover:text-[var(--atc-text)] border border-[var(--atc-border)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Airport Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAirports.map((ap) => {
            const isSelected = selectedAirportId === ap.id;
            const isCurrentSession = savedAirportId === ap.id;

            return (
              <div
                key={ap.id}
                onClick={() => setSelectedAirportId(ap.id)}
                className={`text-left rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3.5 bg-[var(--atc-surface)] shadow-sm hover:shadow-md cursor-pointer ${
                  isSelected
                    ? "border-[var(--atc-accent-border)] ring-2 ring-[var(--atc-accent)]/30 bg-[var(--atc-panel)]"
                    : "border-[var(--atc-border)] hover:border-[var(--atc-border-strong)]"
                }`}
              >
                <div>
                  {/* Top line: ICAO, IATA, Difficulty, Saved */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-black font-mono text-[var(--atc-text)]">
                          {ap.icao}
                        </span>
                        {ap.iata && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-cyan)]">
                            {ap.iata}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${difficultyBadge(
                            ap.difficulty
                          )}`}
                        >
                          {ap.difficulty}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[var(--atc-text)] mt-1 font-sans line-clamp-1">
                        {ap.name}
                      </div>
                      <div className="text-[11px] text-[var(--atc-muted)] font-mono">
                        {ap.city}, {ap.country}
                      </div>
                    </div>

                    <div className="text-right text-[11px] font-mono shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[var(--atc-muted)] block">
                        {ap.runwayCount} RWY
                      </span>
                      {isCurrentSession && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold text-[var(--atc-emerald)] mt-1">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Runways & Specs */}
                  <div className="mt-3 p-2 rounded-xl bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] text-[11px] font-mono space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--atc-muted)]">Runways:</span>
                      <span className="font-bold text-[var(--atc-text)] truncate max-w-[170px]">
                        {ap.runwaySummary}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--atc-muted)]">Elevation / Wind:</span>
                      <span className="text-[var(--atc-cyan)]">
                        {ap.elevationFt} ft • {ap.windLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-2 border-t border-[var(--atc-border)] flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono font-semibold flex items-center gap-1 ${
                      isSelected ? "text-[var(--atc-accent-text)]" : "text-[var(--atc-muted)]"
                    }`}
                  >
                    <Compass className="w-3 h-3" />
                    {isSelected ? "Selected" : "Click to select"}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchGame(ap.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--atc-accent)] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 hover:opacity-90 shadow-sm transition-all cursor-pointer"
                  >
                    <span>Launch</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* World Map Callout */}
        <div className="rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-panel)] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] flex items-center justify-center text-[var(--atc-cyan)] shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold font-mono text-[var(--atc-text)]">
                Looking for another international airport?
              </div>
              <div className="text-xs text-[var(--atc-muted)] font-sans">
                AirCommand includes 1,266 worldwide airports with real OpenStreetMap layouts and runway coordinates.
              </div>
            </div>
          </div>
          <button
            onClick={() => setAppMode("GLOBAL_MAP")}
            className="px-4 py-2 rounded-xl border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[var(--atc-cyan)] hover:opacity-90 font-mono font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            Open Interactive World Map
          </button>
        </div>
      </section>

      {/* 4. CONFIGURATION SECTION (ROLES & SCENARIO) */}
      <section id="configuration-section" className="w-full border-t border-b border-[var(--atc-border)] bg-[var(--atc-panel)] py-10 px-6 sm:px-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[var(--atc-accent)] tracking-wider">
              <Sliders className="w-4 h-4" />
              <span>Session Setup</span>
            </div>
            <h3 className="text-2xl font-mono font-extrabold text-[var(--atc-text)] mt-1">
              Select Starting Station & Traffic Scenario
            </h3>
            <p className="text-xs text-[var(--atc-muted)] font-sans mt-0.5">
              Choose which position you want to control, or let ALL AUTO handle the entire airfield.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Controller Roles */}
            <div className="space-y-3">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--atc-text)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--atc-emerald)]" />
                Active Controller Role
              </label>

              <div className="space-y-2">
                {ROLES.map((r) => {
                  const isRoleSelected = selectedRole === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRole(r.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isRoleSelected
                          ? "border-[var(--atc-accent-border)] bg-[var(--atc-surface)] ring-1 ring-[var(--atc-accent)]/30"
                          : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-extrabold text-[var(--atc-text)]">
                            {r.label}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--atc-panel)] text-[var(--atc-cyan)] border border-[var(--atc-border)]">
                            {r.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--atc-muted)] mt-0.5 font-sans leading-tight">
                          {r.desc}
                        </p>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isRoleSelected
                            ? "border-[var(--atc-accent)] bg-[var(--atc-accent)]"
                            : "border-[var(--atc-border-strong)]"
                        }`}
                      >
                        {isRoleSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Traffic Scenario & Audio Controls */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--atc-text)] flex items-center gap-1.5">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-[var(--atc-amber)]" />
                  Traffic Scenario
                </label>

                <div className="space-y-2">
                  {SCENARIOS.map((sc) => {
                    const isScenSelected = selectedScenario === sc.id;
                    return (
                      <div
                        key={sc.id}
                        onClick={() => setSelectedScenario(sc.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isScenSelected
                            ? "border-[var(--atc-accent-border)] bg-[var(--atc-surface)] ring-1 ring-[var(--atc-accent)]/30"
                            : "border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:border-[var(--atc-border-strong)]"
                        }`}
                      >
                        <div>
                          <div className="text-xs font-mono font-bold text-[var(--atc-text)]">
                            {sc.label}
                          </div>
                          <p className="text-xs text-[var(--atc-muted)] mt-0.5 font-sans leading-tight">
                            {sc.desc}
                          </p>
                        </div>

                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isScenSelected
                              ? "border-[var(--atc-accent)] bg-[var(--atc-accent)]"
                              : "border-[var(--atc-border-strong)]"
                          }`}
                        >
                          {isScenSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ready to Launch Bar */}
              <div className="p-4 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--atc-muted)]">Target Airfield:</span>
                  <span className="font-bold text-[var(--atc-text)]">{activeSelectedAirport.icao} · {activeSelectedAirport.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--atc-muted)]">Active Role:</span>
                  <span className="font-bold text-[var(--atc-cyan)]">{selectedRole === "ALL" ? "ALL AUTO (Recommended)" : selectedRole}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[var(--atc-muted)]">Scenario:</span>
                  <span className="font-bold text-[var(--atc-amber)]">{SCENARIOS.find((s) => s.id === selectedScenario)?.label}</span>
                </div>

                <button
                  onClick={() => handleLaunchGame()}
                  disabled={isLaunching}
                  className="w-full py-3.5 px-4 rounded-xl bg-[var(--atc-accent)] hover:opacity-95 text-slate-950 font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all border border-[var(--atc-accent-border)] cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Simulation Now</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SIMULATOR PILLARS & HOW TO PLAY */}
      <section id="features-section" className="w-full max-w-6xl mx-auto px-6 sm:px-10 py-12 space-y-8">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-[var(--atc-accent)] tracking-wider">
            <Zap className="w-4 h-4" />
            <span>Architecture & Rules</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-mono font-black text-[var(--atc-text)] mt-1">
            Built For Real Air Traffic Precision
          </h3>
          <p className="text-xs sm:text-sm text-[var(--atc-muted)] font-sans mt-2">
            No simplified arcade shortcuts. AirCommand implements strict clearance validation, wake turbulence separations, and authentic ATC phraseology.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] flex items-center justify-center text-[var(--atc-emerald)]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-mono font-bold text-[var(--atc-text)]">
              Clearance-Gated Flow
            </h4>
            <p className="text-xs text-[var(--atc-text-secondary)] font-sans leading-relaxed">
              Aircraft stay stationary until valid ATC clearances are transmitted. Pushback, taxiing, runway crossing, line-up, and takeoff are strictly separated.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[var(--atc-cyan-bg)] border border-[var(--atc-cyan-border)] flex items-center justify-center text-[var(--atc-cyan)]">
              <Mic className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-mono font-bold text-[var(--atc-text)]">
              Voice Recognition & PTT
            </h4>
            <p className="text-xs text-[var(--atc-text-secondary)] font-sans leading-relaxed">
              Hold Spacebar to speak clearances via speech recognition. Virtual pilots verify commands and read them back in authentic synthesized voice.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[var(--atc-amber-bg)] border border-[var(--atc-amber-border)] flex items-center justify-center text-[var(--atc-amber)]">
              <Compass className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-mono font-bold text-[var(--atc-text)]">
              Real OpenStreetMap Layouts
            </h4>
            <p className="text-xs text-[var(--atc-text-secondary)] font-sans leading-relaxed">
              Taxiways (Alpha, Mike, Hotel), rapid exits, hold-short lines, and gate terminals match actual world aerodrome charts.
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-surface)] space-y-2.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)]">
              <Users className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-mono font-bold text-[var(--atc-text)]">
              5-Player Multiplayer
            </h4>
            <p className="text-xs text-[var(--atc-text-secondary)] font-sans leading-relaxed">
              Coordinate in real time: Delivery approves flight plans, Ground manages taxiways, Tower sequences runways, and Departure vectors climbs.
            </p>
          </div>
        </div>

        {/* Hotkey Reference Cheat Sheet */}
        <div className="p-5 rounded-2xl border border-[var(--atc-border)] bg-[var(--atc-panel)] space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--atc-text)]">
            Essential Controller Hotkeys
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">Pause / Play</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-accent)]">Space</kbd>
            </div>
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">Ground Role</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-cyan)]">G / 1</kbd>
            </div>
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">Tower Role</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-amber)]">T / 2</kbd>
            </div>
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">Departure Role</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-emerald)]">D / 3</kbd>
            </div>
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">ALL AUTO</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-text)]">A / 0</kbd>
            </div>
            <div className="p-2 rounded-lg bg-[var(--atc-surface)] border border-[var(--atc-border)] flex items-center justify-between">
              <span className="text-[var(--atc-muted)]">Toggle Audio</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--atc-surface-alt)] font-bold text-[var(--atc-text)]">M</kbd>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CLEAN FOOTER */}
      <footer className="w-full border-t border-[var(--atc-border)] bg-[var(--atc-panel)] py-6 px-6 sm:px-10 text-xs font-mono text-[var(--atc-muted)] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[var(--atc-accent)]" />
          <span>AIRCOMMAND · Air Traffic Control Simulator</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setAppMode("GLOBAL_MAP")}
            className="hover:text-[var(--atc-text)] transition-colors"
          >
            World Map
          </button>
          <button
            onClick={() => setAppMode("MULTIPLAYER_LOBBY")}
            className="hover:text-[var(--atc-text)] transition-colors"
          >
            Multiplayer
          </button>
          <button
            onClick={() => setAppMode("AIRPORT_EDITOR")}
            className="hover:text-[var(--atc-text)] transition-colors"
          >
            Geometry Editor
          </button>
          <button
            onClick={() => setShowVerificationModal(true)}
            className="hover:text-[var(--atc-emerald)] transition-colors"
          >
            Rule Engine
          </button>
        </div>

        <div>
          <span>Crafted for virtual controllers & pilots.</span>
        </div>
      </footer>
    </div>
  );
};
