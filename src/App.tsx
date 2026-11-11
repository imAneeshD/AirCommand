import React, { useEffect } from "react";
import { AirportLandingScreen } from "./components/AirportLandingScreen.tsx";
import { ClearanceControlDeck } from "./components/ClearanceControlDeck.tsx";
import { FlightStripRack } from "./components/FlightStripRack.tsx";
import { RadarScopeCanvas } from "./components/RadarScopeCanvas.tsx";
import { RadioCommsLog } from "./components/RadioCommsLog.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { VerificationModal } from "./components/VerificationModal.tsx";
import { useAtcStore } from "./store/atcStore.ts";

export function App() {
  const showAirportSelector = useAtcStore((s) => s.showAirportSelector);
  const theme = useAtcStore((s) => s.theme);
  const tick = useAtcStore((s) => s.tick);
  const togglePause = useAtcStore((s) => s.togglePause);
  const switchStation = useAtcStore((s) => s.switchStation);

  // Sync data-theme attribute onto <html> so scrollbars and overlays follow Light/Dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Simulation Animation Loop (paused while on Airport Landing Screen)
  useEffect(() => {
    if (showAirportSelector) return;
    let rafId = 0;
    let lastTs = performance.now();
    let accum = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      accum += dt;
      if (accum >= 0.033) {
        tick(accum);
        accum = 0;
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [tick, showAirportSelector]);

  // Global ATC Hotkeys
  useEffect(() => {
    if (showAirportSelector) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "g" || e.key === "G" || e.key === "1") {
        switchStation("GROUND");
      } else if (e.key === "t" || e.key === "T" || e.key === "2") {
        switchStation("TOWER");
      } else if (e.key === "d" || e.key === "D" || e.key === "3") {
        switchStation("DEPARTURE");
      } else if (
        e.key === "n" ||
        e.key === "N" ||
        e.key === "a" ||
        e.key === "A" ||
        e.key === "4" ||
        e.key === "0"
      ) {
        switchStation("ALL");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePause, switchStation, showAirportSelector]);

  if (showAirportSelector) {
    return (
      <div data-theme={theme} className="min-h-screen bg-[var(--atc-bg)] text-[var(--atc-text)] transition-colors">
        <AirportLandingScreen />
        <VerificationModal />
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      className="h-screen w-screen flex flex-col bg-[var(--atc-bg)] text-[var(--atc-text)] overflow-hidden transition-colors"
    >
      <TopBar />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <FlightStripRack />
        <RadarScopeCanvas />
        <ClearanceControlDeck />
      </div>

      <RadioCommsLog />
      <VerificationModal />
    </div>
  );
}

export default App;
