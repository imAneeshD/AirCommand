import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Compass,
  MapPin,
  Moon,
  PlaneTakeoff,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Wind,
} from "lucide-react";
import { AIRPORT_CATALOG, createAirportById } from "../data/asteriaAirport.ts";
import { useAtcStore } from "../store/atcStore.ts";
import type { AirportId, PlayerRoleMode, ScenarioId } from "../types/atc.ts";
import { Accordion } from "./Accordion.tsx";

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "NORMAL_OPS", label: "Normal Operations" },
  { id: "CROSSINGS_AND_READBACK", label: "Runway Crossings & Readbacks" },
  { id: "EMERGENCY_AND_NORDO", label: "Emergency & NORDO 7600" },
  { id: "RUSH_HOUR", label: "Peak Rush Hour" },
  { id: "SANDBOX", label: "Clean Sandbox" },
];

const ROLES: Array<{ id: PlayerRoleMode; label: string; sub: string }> = [
  { id: "ALL", label: "ALL AUTO (Default)", sub: "All 3 stations automated, hear all" },
  { id: "GROUND", label: "GROUND (G)", sub: "Pushback, taxi & crossings" },
  { id: "TOWER", label: "TOWER (T)", sub: "Runways, takeoffs & landings" },
  { id: "DEPARTURE", label: "DEP / APP (D)", sub: "Vectors, climbs & ILS" },
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

const AirportMiniPreview: React.FC<{ airportId: AirportId; isLight: boolean }> = ({
  airportId,
  isLight,
}) => {
  const layout = useMemo(() => createAirportById(airportId), [airportId]);
  const toX = (wx: number) => 110 + wx * 88;
  const toY = (wy: number) => 56 - wy * 76;
  const rotDeg = layout.chartRotationDeg ?? 0;
  const rotScale = rotDeg !== 0 ? 0.68 : 1;

  return (
    <svg
      viewBox="0 0 220 112"
      className="w-full h-24 rounded-lg border border-[var(--atc-border)]"
      style={{ backgroundColor: isLight ? "#efeae0" : "#050a11" }}
    >
      <g transform={`translate(110 56) rotate(${rotDeg}) scale(${rotScale}) translate(-110 -56)`}>
      {/* Taxiway edges */}
      {layout.edges.map((e) => {
        const n1 = layout.nodes[e.from];
        const n2 = layout.nodes[e.to];
        if (!n1 || !n2 || e.from > e.to) return null;
        return (
          <line
            key={e.id}
            x1={toX(n1.x)}
            y1={toY(n1.y)}
            x2={toX(n2.x)}
            y2={toY(n2.y)}
            stroke={
              isLight
                ? e.taxiway === "APRON"
                  ? "#c7beaa"
                  : "#d97706"
                : e.taxiway === "APRON"
                ? "#334155"
                : "#b45309"
            }
            strokeWidth={e.taxiway === "APRON" ? 1 : 1.5}
            strokeOpacity={0.8}
          />
        );
      })}

      {/* Runways */}
      {layout.runwayIds.map((rId) => {
        const rwy = layout.runways[rId];
        const x1 = toX(rwy.thresholdX);
        const y1 = toY(rwy.thresholdY);
        const x2 = toX(rwy.endX);
        const y2 = toY(rwy.endY);
        return (
          <g key={rId}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isLight ? "#293240" : "#475569"}
              strokeWidth={6}
              strokeLinecap="butt"
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#f8fafc"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </g>
        );
      })}

      {/* Gate dots */}
      {layout.gateIds.map((gid) => {
        const gn = layout.nodes[`GATE_${gid}`];
        if (!gn) return null;
        return (
          <circle
            key={gid}
            cx={toX(gn.x)}
            cy={toY(gn.y)}
            r={2}
            fill={isLight ? "#0284c7" : "#38bdf8"}
          />
        );
      })}
      </g>
    </svg>
  );
};

export const AirportLandingScreen: React.FC = () => {
  const savedAirportId = useAtcStore((s) => s.savedAirportId);
  const sim = useAtcStore((s) => s.sim);
  const theme = useAtcStore((s) => s.theme);
  const toggleTheme = useAtcStore((s) => s.toggleTheme);
  const selectAndSaveAirport = useAtcStore((s) => s.selectAndSaveAirport);
  const forgetSavedAirport = useAtcStore((s) => s.forgetSavedAirport);
  const setShowVerificationModal = useAtcStore((s) => s.setShowVerificationModal);

  const [selectedAirport, setSelectedAirport] = useState<AirportId>(
    savedAirportId ?? sim.airport.id ?? "KAST"
  );
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(sim.scenarioId);
  const [selectedRole, setSelectedRole] = useState<PlayerRoleMode>("ALL");

  const isLight = theme === "light";
  const activeSummary =
    AIRPORT_CATALOG.find((a) => a.id === selectedAirport) ?? AIRPORT_CATALOG[0];

  return (
    <div className="min-h-screen w-screen bg-[var(--atc-bg)] text-[var(--atc-text)] flex flex-col overflow-y-auto transition-colors">
      {/* Top Header */}
      <header className="border-b border-[var(--atc-border)] bg-[var(--atc-panel)] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--atc-accent-bg)] border border-[var(--atc-accent-border)] flex items-center justify-center text-[var(--atc-accent-text)] shadow-[var(--atc-shadow)]">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wider text-[var(--atc-text)] uppercase font-mono">
              AirCommand
            </h1>
            <p className="text-xs text-[var(--atc-muted)] font-mono">
              Multi-Airport Clearance-Gated Air Traffic Simulator
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            title={isLight ? "Switch to Dark Radar Theme" : "Switch to Light Chart Theme"}
            aria-label="Toggle Light/Dark Theme"
            className="px-2.5 py-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] hover:border-[var(--atc-border-strong)] text-[var(--atc-text)] text-xs font-mono flex items-center gap-1.5 shadow-sm"
          >
            {isLight ? (
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{isLight ? "LIGHT THEME" : "DARK THEME"}</span>
          </button>

          {savedAirportId && (
            <button
              onClick={forgetSavedAirport}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--atc-border)] hover:border-[var(--atc-border-strong)] bg-[var(--atc-surface)] text-[var(--atc-text-secondary)] text-xs font-mono flex items-center gap-1.5 shadow-sm"
              title="Clear saved default airport from localStorage"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Saved: {savedAirportId}
            </button>
          )}

          <button
            onClick={() => setShowVerificationModal(true)}
            className="px-3 py-1.5 rounded-lg bg-[var(--atc-emerald-bg)] hover:opacity-90 border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-xs font-mono font-semibold flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            VERIFY RULES
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 flex flex-col gap-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider text-[var(--atc-text-secondary)] uppercase flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[var(--atc-accent)]" />
              Select Destination Airport (Saved Automatically)
            </h2>
            <span className="text-[11px] font-mono text-[var(--atc-muted)]">
              4 Airfields • Double-click any airfield to launch immediately
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AIRPORT_CATALOG.map((ap) => {
              const isSelected = selectedAirport === ap.id;
              const isSaved = savedAirportId === ap.id;

              return (
                <button
                  key={ap.id}
                  onClick={() => setSelectedAirport(ap.id)}
                  onDoubleClick={() =>
                    selectAndSaveAirport(ap.id, selectedScenario, selectedRole)
                  }
                  className={`text-left rounded-xl border p-4 transition-all flex flex-col gap-3 bg-[var(--atc-surface)] shadow-[var(--atc-shadow)] ${
                    isSelected
                      ? "border-[var(--atc-accent-border)] ring-2 ring-[var(--atc-accent)]/35"
                      : "border-[var(--atc-border)] hover:border-[var(--atc-border-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold font-mono text-[var(--atc-text)]">
                          {ap.icao}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${difficultyBadge(
                            ap.difficulty
                          )}`}
                        >
                          {ap.difficulty}
                        </span>
                        {isSaved && (
                          <span className="px-2 py-0.5 rounded bg-[var(--atc-emerald-bg)] border border-[var(--atc-emerald-border)] text-[var(--atc-emerald)] text-[10px] font-mono flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> SAVED
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-bold text-[var(--atc-text)] mt-0.5">
                        {ap.name}
                      </div>
                      <div className="text-[11px] text-[var(--atc-muted)] font-mono">
                        {ap.city}
                      </div>
                    </div>

                    <div className="text-right text-[11px] font-mono">
                      <div className="text-[var(--atc-cyan)] font-bold">RWY {ap.runwaySummary}</div>
                      <div className="text-[var(--atc-muted)]">ELEV {ap.elevationFt} FT</div>
                    </div>
                  </div>

                  <AirportMiniPreview airportId={ap.id} isLight={isLight} />

                  <p className="text-xs text-[var(--atc-text-secondary)] leading-relaxed">
                    {ap.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--atc-muted)] pt-1.5 border-t border-[var(--atc-border)]">
                    <span className="flex items-center gap-1">
                      <Wind className="w-3.5 h-3.5 text-[var(--atc-cyan)]" />
                      {ap.windLabel}
                    </span>
                    <span
                      className={`flex items-center gap-1 font-semibold ${
                        isSelected ? "text-[var(--atc-accent-text)]" : ""
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5 text-[var(--atc-emerald)]" />
                      {isSelected ? "SELECTED" : "CLICK TO SELECT"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Minimal Launch Bar + Collapsible Role/Scenario Options Accordion */}
        <section className="space-y-3">
          <Accordion
            title="Session Options (Traffic Scenario & Starting Role)"
            icon={<Sliders className="w-3.5 h-3.5" />}
            defaultOpen={false}
            badge={
              <span className="text-[10px] font-mono text-[var(--atc-muted)]">
                {SCENARIOS.find((s) => s.id === selectedScenario)?.label} •{" "}
                {selectedRole === "ALL" ? "ALL AUTO" : selectedRole}
              </span>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-bold text-[var(--atc-text-secondary)] uppercase block">
                  Initial Traffic Scenario
                </label>
                <select
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value as ScenarioId)}
                  className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md px-3 py-2 text-xs font-mono text-[var(--atc-text)] focus:outline-none"
                >
                  {SCENARIOS.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-mono font-bold text-[var(--atc-text-secondary)] uppercase block">
                  Starting Controller Role (Default: ALL AUTO)
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as PlayerRoleMode)}
                  className="w-full bg-[var(--atc-surface-alt)] border border-[var(--atc-border)] rounded-md px-3 py-2 text-xs font-mono text-[var(--atc-text)] focus:outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.sub}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Accordion>

          <button
            onClick={() =>
              selectAndSaveAirport(selectedAirport, selectedScenario, selectedRole)
            }
            className="w-full py-3 px-5 rounded-xl bg-[var(--atc-accent)] hover:opacity-95 text-slate-950 font-mono font-extrabold text-sm flex items-center justify-center gap-2 shadow-[var(--atc-shadow)] transition-all border border-[var(--atc-accent-border)]"
          >
            <PlaneTakeoff className="w-4 h-4" />
            LAUNCH {activeSummary.icao} — {activeSummary.name.toUpperCase()} (
            {selectedRole === "ALL" ? "ALL AUTO" : selectedRole})
          </button>
        </section>
      </main>
    </div>
  );
};
