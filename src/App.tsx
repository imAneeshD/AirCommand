import React, { useEffect, useState } from "react";
import { AirportGeometryEditor } from "./components/AirportGeometryEditor.tsx";
import { ClearanceControlDeck } from "./components/ClearanceControlDeck.tsx";
import { FlightStripRack } from "./components/FlightStripRack.tsx";
import { GlobalAirportMap } from "./components/GlobalAirportMap.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { LiveTrafficView } from "./components/LiveTrafficView.tsx";
import { MobileAircraftQuickCard } from "./components/MobileAircraftQuickCard.tsx";
import { MobileBottomNav } from "./components/MobileBottomNav.tsx";
import { MobileViewHeader } from "./components/MobileViewHeader.tsx";
import { MultiplayerLobby } from "./components/MultiplayerLobby.tsx";
import { PostSessionModal } from "./components/PostSessionModal.tsx";
import { RadarScopeCanvas } from "./components/RadarScopeCanvas.tsx";
import { RadioCommsLog } from "./components/RadioCommsLog.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { VerificationModal } from "./components/VerificationModal.tsx";
import { PlaneFlightLoader } from "./components/PlaneFlightLoader.tsx";
import { UserEmailSessionModal } from "./components/UserEmailSessionModal.tsx";
import { PilotDispatchScreen } from "./components/PilotDispatchScreen.tsx";
import { CockpitFlightDeck } from "./components/CockpitFlightDeck.tsx";
import { useAtcStore } from "./store/atcStore.ts";
import { radioAudio } from "./utils/radioAudio.ts";
import { speechPtt } from "./utils/speechRecognitionPtt.ts";
import { sessionTracker } from "./utils/sessionTracker.ts";
import { loadSavedUserEmail } from "./utils/storage.ts";

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
  const isOnline = useAtcStore((s) => s.isOnline);
  const liveSyncEnabled = useAtcStore((s) => Boolean(s.sim.liveSnapshotMeta?.liveSyncEnabled));
  const pollLiveTraffic = useAtcStore((s) => s.pollLiveTraffic);
  const mobileTab = useAtcStore((s) => s.mobileTab);
  const setMobileTab = useAtcStore((s) => s.setMobileTab);
  const sim = useAtcStore((s) => s.sim);
  const selectAircraft = useAtcStore((s) => s.selectAircraft);
  const globalLoading = useAtcStore((s) => s.globalLoading);

  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);
  const showEmailModal = useAtcStore((s) => s.showEmailModal);
  const setShowEmailModal = useAtcStore((s) => s.setShowEmailModal);

  // Auto-prompt on initial app mount if user has no saved email
  useEffect(() => {
    if (!loadSavedUserEmail()) {
      setShowEmailModal(true);
    }
  }, [setShowEmailModal]);

  // Auto-start session tracking & prompt for controller email logbook when entering simulation
  useEffect(() => {
    if (appMode !== "SIMULATION") {
      sessionTracker.endSession();
      return;
    }

    if (!loadSavedUserEmail()) {
      setShowEmailModal(true);
    }
    sessionTracker.startSession(sim, () => useAtcStore.getState().sim);

    return () => {
      sessionTracker.endSession();
    };
  }, [appMode, setShowEmailModal, sim]);

  useEffect(() => {
    setMobileSheetExpanded(false);
  }, [mobileTab]);

  // Sync data-theme attribute onto <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Immediately stop all speech synthesis & voice input when screen is closed, minimized or backgrounded
  useEffect(() => {
    const handleTeardown = () => {
      radioAudio.stopAllSpeech();
      speechPtt.cancel();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        handleTeardown();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleTeardown);
    window.addEventListener("pagehide", handleTeardown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleTeardown);
      window.removeEventListener("pagehide", handleTeardown);
      handleTeardown();
    };
  }, []);

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

  // Periodic background live ADS-B traffic sync ("in between as well")
  useEffect(() => {
    if (appMode !== "SIMULATION" || !isOnline || (roomState && roomState.status === "ACTIVE") || !liveSyncEnabled) return;

    const initialTimeout = setTimeout(() => {
      void pollLiveTraffic();
    }, 1500);

    const intervalId = setInterval(() => {
      void pollLiveTraffic();
    }, 18000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
  }, [appMode, isOnline, roomState?.status, liveSyncEnabled, pollLiveTraffic]);

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
      {appMode === "LANDING" && <LandingPage />}
      {appMode === "GLOBAL_MAP" && <GlobalAirportMap />}
      {appMode === "LIVE_OBSERVATION" && <LiveTrafficView />}
      {appMode === "AIRPORT_EDITOR" && <AirportGeometryEditor />}
      {appMode === "MULTIPLAYER_LOBBY" && <MultiplayerLobby />}
      {appMode === "PILOT_SETUP" && <PilotDispatchScreen />}
      {appMode === "PILOT_COCKPIT" && <CockpitFlightDeck />}

      {appMode === "SIMULATION" && (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
          <TopBar />

          {/* DESKTOP WORKSPACE LAYOUT (>= 1024px, lg:flex) */}
          <div className="hidden lg:flex flex-1 min-h-0 overflow-hidden">
            <FlightStripRack />
            <RadarScopeCanvas />
            <ClearanceControlDeck />
          </div>
          <div className="hidden lg:block">
            <RadioCommsLog />
          </div>

          {/* MOBILE PHONE / TABLET WORKSPACE LAYOUT (< 1024px, flex lg:hidden) */}
          <div className="flex lg:hidden flex-1 min-h-0 relative overflow-hidden flex-col h-full w-full">
            {/* Base Radar Scope Canvas: Always mounted & always visible */}
            <div className="w-full h-full flex flex-col flex-1 min-h-0">
              <RadarScopeCanvas />
            </div>

            {/* Slide-Up Bottom Sheet for Panels (Clearances, Strips, Radio) — Map stays visible above! */}
            {mobileTab !== "RADAR" && (
              <div
                className={`absolute bottom-[58px] inset-x-0 z-30 flex flex-col bg-[var(--atc-panel)] border-t border-[var(--atc-border)] rounded-t-2xl shadow-2xl overflow-hidden transition-all duration-200 animate-in slide-in-from-bottom ${
                  mobileSheetExpanded ? "h-[85vh] max-h-[88vh]" : "h-[54vh] max-h-[58vh]"
                }`}
              >
                {/* Pull handle / tap toggle */}
                <div
                  onClick={() => setMobileSheetExpanded((prev: boolean) => !prev)}
                  className="w-full pt-2 pb-1 flex justify-center bg-[var(--atc-surface)] cursor-pointer hover:bg-[var(--atc-surface-alt)] transition-colors select-none"
                  title={mobileSheetExpanded ? "Collapse sheet (show more map)" : "Expand sheet"}
                >
                  <div className="w-10 h-1 bg-[var(--atc-border-strong)] rounded-full opacity-60" />
                </div>

                {/* Mobile Clearance Deck View */}
                {mobileTab === "CLEARANCE" && (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <MobileViewHeader
                      title={
                        sim.selectedAircraftId && sim.aircraft[sim.selectedAircraftId]
                          ? `CLEARANCES · ${sim.aircraft[sim.selectedAircraftId].callsign}`
                          : "CLEARANCES"
                      }
                      subtitle={
                        sim.selectedAircraftId && sim.aircraft[sim.selectedAircraftId]
                          ? `${sim.aircraft[sim.selectedAircraftId].aircraftType} • ${sim.aircraft[sim.selectedAircraftId].state.replace(/_/g, " ")}`
                          : "Select an aircraft to issue commands"
                      }
                      onClose={() => setMobileTab("RADAR")}
                      isExpanded={mobileSheetExpanded}
                      onToggleExpand={() => setMobileSheetExpanded((prev: boolean) => !prev)}
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <ClearanceControlDeck mobileMode={true} />
                    </div>
                  </div>
                )}

                {/* Mobile Flight Strips View */}
                {mobileTab === "STRIPS" && (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <MobileViewHeader
                      title="FLIGHT STRIPS"
                      subtitle={`${sim.aircraftOrder.length} Flights Active`}
                      onClose={() => setMobileTab("RADAR")}
                      isExpanded={mobileSheetExpanded}
                      onToggleExpand={() => setMobileSheetExpanded((prev: boolean) => !prev)}
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <FlightStripRack
                        mobileMode={true}
                        onSelectAndClear={() => setMobileTab("CLEARANCE")}
                      />
                    </div>
                  </div>
                )}

                {/* Mobile Radio & Event Log View */}
                {mobileTab === "COMMS" && (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <MobileViewHeader
                      title="RADIO & EVENT LOG"
                      subtitle={`${sim.radioLog.length} Transmissions`}
                      onClose={() => setMobileTab("RADAR")}
                      isExpanded={mobileSheetExpanded}
                      onToggleExpand={() => setMobileSheetExpanded((prev: boolean) => !prev)}
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <RadioCommsLog mobileMode={true} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Floating Quick Action Card on Radar View when aircraft is selected and no sheet is open */}
            {mobileTab === "RADAR" &&
              sim.selectedAircraftId &&
              sim.aircraft[sim.selectedAircraftId] && (
                <MobileAircraftQuickCard
                  aircraft={sim.aircraft[sim.selectedAircraftId]}
                  onOpenClearances={() => setMobileTab("CLEARANCE")}
                  onDeselect={() => selectAircraft(null)}
                />
              )}

            {/* Mobile Bottom Navigation Bar */}
            <MobileBottomNav />
          </div>
        </div>
      )}

      <VerificationModal />
      <PostSessionModal />
      <UserEmailSessionModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
      />

      {/* Global Animated Plane in Air Loading Screen */}
      {globalLoading?.active && (
        <PlaneFlightLoader
          message={globalLoading.message}
          submessage={globalLoading.submessage}
          fullscreen={true}
        />
      )}
    </div>
  );
}

export default App;
