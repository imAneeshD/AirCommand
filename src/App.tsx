import React, { useEffect } from "react";
import { AirportGeometryEditor } from "./components/AirportGeometryEditor.tsx";
import { ClearanceControlDeck } from "./components/ClearanceControlDeck.tsx";
import { FlightStripRack } from "./components/FlightStripRack.tsx";
import { GlobalAirportMap } from "./components/GlobalAirportMap.tsx";
import { LiveTrafficView } from "./components/LiveTrafficView.tsx";
import { MultiplayerLobby } from "./components/MultiplayerLobby.tsx";
import { PostSessionModal } from "./components/PostSessionModal.tsx";
import { RadarScopeCanvas } from "./components/RadarScopeCanvas.tsx";
import { RadioCommsLog } from "./components/RadioCommsLog.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { VerificationModal } from "./components/VerificationModal.tsx";
import { useAtcStore } from "./store/atcStore.ts";

export function App() {
  const appMode = useAtcStore((s) => s.appMode);
  const roomState = useAtcStore((s) => s.roomState);
  const theme = useAtcStore((s) => s.theme);
  const tick = useAtcStore((s) => s.tick);
  const togglePause = useAtcStore((s) => s.togglePause);
  const toggleVoice = useAtcStore((s) => s.toggleVoice);
  const switchStation = useAtcStore((s) => s.switchStation);
  const setOnline = useAtcStore((s) => s.setOnline);
  const hydrateSavedRealAirport = useAtcStore((s) => s.hydrateSavedRealAirport);
  const syncPendingOfflineEdits = useAtcStore((s) => s.syncPendingOfflineEdits);

  // Sync data-theme attribute onto <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Hydrate saved real-world airport & track online/offline state
  useEffect(() => {
    void hydrateSavedRealAirport();
    const handleOnline = () => {
      setOnline(true);
      void syncPendingOfflineEdits();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [hydrateSavedRealAirport, setOnline, syncPendingOfflineEdits]);

  // Simulation Animation Loop (solo only; multiplayer runs authoritatively on server at 5 Hz)
  useEffect(() => {
    if (appMode !== "SIMULATION") return;
    if (roomState && roomState.status === "ACTIVE") return;

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
  }, [tick, appMode, roomState?.status]);

  // Global ATC Hotkeys
  useEffect(() => {
    if (appMode !== "SIMULATION") return;
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
      } else if (e.key === "m" || e.key === "M") {
        toggleVoice();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePause, toggleVoice, switchStation, appMode]);

  return (
    <div data-theme={theme} className="h-screen w-screen bg-[var(--atc-bg)] text-[var(--atc-text)] transition-colors overflow-hidden">
      {appMode === "GLOBAL_MAP" && <GlobalAirportMap />}
      {appMode === "LIVE_OBSERVATION" && <LiveTrafficView />}
      {appMode === "AIRPORT_EDITOR" && <AirportGeometryEditor />}
      {appMode === "MULTIPLAYER_LOBBY" && <MultiplayerLobby />}

      {appMode === "SIMULATION" && (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
          <TopBar />
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <FlightStripRack />
            <RadarScopeCanvas />
            <ClearanceControlDeck />
          </div>
          <RadioCommsLog />
        </div>
      )}

      <VerificationModal />
      <PostSessionModal />
    </div>
  );
}

export default App;
