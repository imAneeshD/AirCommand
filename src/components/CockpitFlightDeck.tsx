import React, { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Radio,
  Sliders,
  Volume2,
  VolumeX,
  X,
  Map as MapIcon,
  ListChecks,
  ArrowLeft,
  Gauge,
  Power,
  Zap,
  Shield,
  Plane,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Layers,
  Send,
} from "lucide-react";
import { useAtcStore } from "../store/atcStore.ts";
import { RadarScopeCanvas } from "./RadarScopeCanvas.tsx";
import { PilotChecklistDrawer } from "./PilotChecklistDrawer.tsx";
import { cockpitSound } from "../utils/cockpitSoundEngine.ts";
import type { ThrottleDetent, PilotRadioRequestType } from "../types/pilot.ts";

export function CockpitFlightDeck() {
  const setAppMode = useAtcStore((s) => s.setAppMode);
  const sim = useAtcStore((s) => s.sim);
  const pilotAircraftId = useAtcStore((s) => s.pilotAircraftId);
  const pilotConfig = useAtcStore((s) => s.pilotConfig);
  const controls = useAtcStore((s) => s.cockpitControls);
  const updateCockpitControls = useAtcStore((s) => s.updateCockpitControls);
  const transmitPilotRadioRequest = useAtcStore((s) => s.transmitPilotRadioRequest);
  const voiceEnabled = useAtcStore((s) => s.voiceEnabled);
  const toggleVoice = useAtcStore((s) => s.toggleVoice);

  // Overlay state
  const [showRadarMiniMap, setShowRadarMiniMap] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  // Active player aircraft
  const playerAc = pilotAircraftId ? sim.aircraft[pilotAircraftId] : null;

  // Active AI Traffic Aircraft (Phase 1: max 2 planes)
  const aiAcId = sim.aircraftOrder.find((id) => id !== pilotAircraftId);
  const aiAc = aiAcId ? sim.aircraft[aiAcId] : null;

  const elev = sim.airport.elevationFt;
  const currentSpeed = playerAc ? Math.round(playerAc.speed) : 0;
  const currentAlt = playerAc ? Math.round(playerAc.altitude) : elev;
  const currentHeading = playerAc ? Math.round(playerAc.heading) : 90;
  const currentVsi = playerAc ? Math.round(playerAc.verticalSpeed) : 0;
  const agl = Math.max(0, currentAlt - elev);

  const v1 = pilotConfig?.v1Speed || 135;
  const vr = pilotConfig?.vrSpeed || 142;
  const v2 = pilotConfig?.v2Speed || 148;

  const isIfrCleared = playerAc?.flightPlan?.clearanceStatus === "CLEARED";

  // Engine sound effect dynamic modulation
  useEffect(() => {
    if (controls.engine1Master || controls.engine2Master) {
      cockpitSound.updateEngineN1(Math.max(controls.engine1N1, controls.engine2N1));
    }
  }, [controls.engine1Master, controls.engine2Master, controls.engine1N1, controls.engine2N1]);

  // Global Flight Deck Keyboard Controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        setShowRadarMiniMap((prev) => !prev);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        setShowChecklist((prev) => !prev);
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        updateCockpitControls({ parkingBrake: !controls.parkingBrake });
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        const nextFlaps = controls.flaps === 0 ? 1 : controls.flaps === 1 ? 2 : controls.flaps === 2 ? 3 : 0;
        updateCockpitControls({ flaps: nextFlaps as 0 | 1 | 2 | 3 });
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        const nextThrot: ThrottleDetent =
          controls.throttle === "IDLE"
            ? "CLB"
            : controls.throttle === "CLB"
            ? "FLEX"
            : "TOGA";
        updateCockpitControls({ throttle: nextThrot });
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        const nextThrot: ThrottleDetent =
          controls.throttle === "TOGA"
            ? "FLEX"
            : controls.throttle === "FLEX"
            ? "CLB"
            : "IDLE";
        updateCockpitControls({ throttle: nextThrot });
      } else if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        e.preventDefault();
        updateCockpitControls({
          tillerAngle: Math.max(-28, controls.tillerAngle - 8),
        });
      } else if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        e.preventDefault();
        updateCockpitControls({
          tillerAngle: Math.min(28, controls.tillerAngle + 8),
        });
      } else if (e.key === "1") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("IFR_CLEARANCE");
      } else if (e.key === "2") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("PUSHBACK");
      } else if (e.key === "3") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("TAXI");
      } else if (e.key === "4") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("LINE_UP");
      } else if (e.key === "5") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("TAKEOFF");
      } else if (e.key === "6") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        transmitPilotRadioRequest("CLIMB");
      } else if (e.code === "Space") {
        e.preventDefault();
        cockpitSound.playSwitchClick();
        if (!isIfrCleared) {
          transmitPilotRadioRequest("IFR_CLEARANCE");
        } else if (playerAc?.state === "AT_GATE") {
          transmitPilotRadioRequest("PUSHBACK");
        } else if (playerAc?.state === "PUSHING_BACK" || playerAc?.state === "PUSHBACK_COMPLETE") {
          transmitPilotRadioRequest("TAXI");
        } else if (playerAc?.state === "TAXIING") {
          transmitPilotRadioRequest("LINE_UP");
        } else if (playerAc?.state === "HOLDING_SHORT" || playerAc?.state === "LINE_UP_WAIT") {
          transmitPilotRadioRequest("TAKEOFF");
        } else if (playerAc?.state === "TAKEOFF_ROLL" || playerAc?.state === "ROTATE") {
          transmitPilotRadioRequest("CLIMB");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controls, playerAc, isIfrCleared, transmitPilotRadioRequest, updateCockpitControls]);

  // Center tiller smoothly when not turning
  useEffect(() => {
    if (Math.abs(controls.tillerAngle) > 0.5) {
      const timer = setTimeout(() => {
        updateCockpitControls({
          tillerAngle: controls.tillerAngle * 0.75,
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [controls.tillerAngle, updateCockpitControls]);

  // Handlers for cockpit switches with sound
  const handleToggleEngine = () => {
    const next = !controls.engine1Master;
    cockpitSound.playSwitchClick();
    if (next) {
      cockpitSound.startEngine(20);
    } else {
      cockpitSound.stopEngine();
    }
    updateCockpitControls({ engine1Master: next, engine2Master: next });
  };

  const handleToggleApu = () => {
    const next = !controls.apuMaster;
    cockpitSound.playSwitchClick();
    if (next) {
      cockpitSound.playApuStart();
    }
    updateCockpitControls({ apuMaster: next, apuStart: next });
  };

  const handleToggleBattery = () => {
    cockpitSound.playSwitchClick();
    const next = !controls.battery1;
    updateCockpitControls({ battery1: next, battery2: next });
  };

  const handleToggleParkingBrake = () => {
    cockpitSound.playSwitchClick();
    updateCockpitControls({ parkingBrake: !controls.parkingBrake });
  };

  const handleToggleFlaps = () => {
    cockpitSound.playSwitchClick();
    const next = controls.flaps === 0 ? 1 : controls.flaps === 1 ? 2 : controls.flaps === 2 ? 3 : 0;
    updateCockpitControls({ flaps: next as 0 | 1 | 2 | 3 });
  };

  const handleSelectThrottle = (mode: ThrottleDetent) => {
    cockpitSound.playSwitchClick();
    updateCockpitControls({ throttle: mode });
  };

  const handleRadioOption = (type: PilotRadioRequestType) => {
    cockpitSound.playSwitchClick();
    transmitPilotRadioRequest(type);
  };

  // Determine current radio channel & frequency
  const radioRole = playerAc?.controller || "GROUND";
  const frequencyLabel =
    radioRole === "DELIVERY"
      ? "121.750 MHz (DEL)"
      : radioRole === "GROUND"
      ? "121.900 MHz (GND)"
      : radioRole === "TOWER"
      ? "118.100 MHz (TWR)"
      : "119.500 MHz (DEP)";

  // Last radio message
  const lastRadioMsg = sim.radioLog[sim.radioLog.length - 1];

  // Windshield vanishing horizon math
  const pitchOffset = controls.pitchAngle * 4;
  const rollDeg = (controls.tillerAngle / 28) * Math.min(currentSpeed, 25) * 0.3;

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none font-mono">
      {/* 1. TOP ANNUNCIATOR & AVIONICS HEADER */}
      <header className="h-12 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              cockpitSound.stopEngine();
              setAppMode("PILOT_SETUP");
            }}
            className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Exit Cockpit to Briefing"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Briefing</span>
          </button>

          {/* Callsign & Aircraft Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-amber-400">
              {pilotConfig?.callsign || "PLAYER1"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {pilotConfig?.modelCode || "A20N"}
            </span>
            <span className="text-[10px] text-slate-500 hidden md:inline">
              {pilotConfig?.registration} · Gate {pilotConfig?.gateId || "T1_1"} · State: {playerAc?.state || "AT_GATE"}
            </span>
          </div>
        </div>

        {/* VHF Radio Transceiver Display */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg border border-slate-700 bg-slate-950 text-xs">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-[10px] text-slate-400">COM1:</span>
          <span className="font-extrabold text-cyan-400">{frequencyLabel}</span>
          <span className="text-slate-600">|</span>
          <span className="text-[10px] text-slate-400">XPDR:</span>
          <span className="font-bold text-amber-400">{playerAc?.squawk || "7321"}</span>
        </div>

        {/* Quick Tools: Radar Mini-Map, Checklist, Audio */}
        <div className="flex items-center gap-2">
          {/* Audio Mute toggle */}
          <button
            onClick={toggleVoice}
            className={`p-1.5 rounded border text-xs transition-colors cursor-pointer ${
              voiceEnabled
                ? "border-emerald-600 bg-emerald-950/40 text-emerald-400"
                : "border-slate-700 bg-slate-800 text-slate-500"
            }`}
            title="Toggle Voice Callouts & ATC Audio (Mute)"
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Electronic Checklist Drawer Toggle */}
          <button
            onClick={() => {
              cockpitSound.playSwitchClick();
              setShowChecklist((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showChecklist
                ? "border-emerald-500 bg-emerald-950 text-emerald-400"
                : "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
            title="Toggle Electronic Checklist Drawer (C)"
          >
            <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">ECL</span>
            <span className="text-[10px] text-slate-400">[C]</span>
          </button>

          {/* Toggleable Radar Mini-Map [M] */}
          <button
            onClick={() => {
              cockpitSound.playSwitchClick();
              setShowRadarMiniMap((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showRadarMiniMap
                ? "border-cyan-500 bg-cyan-950 text-cyan-400 shadow-md"
                : "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
            title="Toggle ATC Radar Mini-Map Overlay (M)"
          >
            <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Map</span>
            <span className="text-[10px] text-slate-400">[M]</span>
          </button>
        </div>
      </header>

      {/* 2. OUT-OF-WINDSHIELD FORWARD 2.5D RUNWAY VIEWPORT */}
      <div className="relative h-40 sm:h-48 w-full bg-slate-900 border-b border-slate-800 overflow-hidden shrink-0">
        <div
          className="absolute inset-0 transition-transform duration-75"
          style={{
            transform: `translateY(${pitchOffset}px) rotate(${rollDeg}deg)`,
          }}
        >
          {/* Sky Gradient */}
          <div className="h-1/2 w-full bg-gradient-to-b from-sky-950 via-slate-900 to-indigo-950" />
          
          {/* Horizon Line */}
          <div className="h-0.5 w-full bg-cyan-800/40" />

          {/* Ground Terrain */}
          <div className="h-1/2 w-full bg-gradient-to-b from-slate-900 via-stone-950 to-neutral-950 relative">
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
              preserveAspectRatio="none"
              viewBox="0 0 1000 500"
            >
              <polygon points="460,0 540,0 720,500 280,500" fill="#1c1917" stroke="#44403c" strokeWidth="2" />
              <line
                x1="500"
                y1="0"
                x2="500"
                y2="500"
                stroke="#e2e8f0"
                strokeWidth="6"
                strokeDasharray="30 20"
                strokeDashoffset={-((sim.time * (currentSpeed || 5) * 8) % 100)}
              />
              <line x1="470" y1="0" x2="310" y2="500" stroke="#facc15" strokeWidth="3" />
              <line x1="530" y1="0" x2="690" y2="500" stroke="#facc15" strokeWidth="3" />
            </svg>
          </div>
        </div>

        {/* Glareshield / Cockpit Windshield Frame Vignette */}
        <div className="absolute inset-0 pointer-events-none border-x-[24px] border-t-[8px] border-slate-950/90 shadow-[inset_0_0_80px_rgba(0,0,0,0.8)]" />

        {/* HUD Pitch & Flight Path Vector Reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 border border-cyan-400/40 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-cyan-400/80 shadow-[0_0_8px_#22d3ee]" />
            <div className="absolute w-8 h-[1px] bg-cyan-400/50" />
            <div className="absolute h-8 w-[1px] bg-cyan-400/50" />
          </div>
        </div>

        {/* HUD Overlay Stats Top Left */}
        <div className="absolute top-2.5 left-4 text-[11px] font-mono text-cyan-400/90 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1.5 rounded border border-cyan-900/50 space-y-0.5">
          <div>HDG: <span className="font-bold text-white">{String(currentHeading).padStart(3, "0")}°</span></div>
          <div>IAS: <span className="font-bold text-white">{currentSpeed} kt</span></div>
          <div>AGL: <span className="font-bold text-white">{agl} ft</span></div>
        </div>

        {/* Wind & Active Runway Top Right */}
        <div className="absolute top-2.5 right-4 text-[11px] font-mono text-amber-400/90 bg-slate-950/60 backdrop-blur-sm px-2.5 py-1.5 rounded border border-amber-900/50 text-right space-y-0.5">
          <div>RWY: <span className="font-bold text-white">{playerAc?.targetRunway || "09L"}</span></div>
          <div>WIND: <span className="font-bold text-white">270° / 10 kt</span></div>
          <div className="text-[10px] text-slate-400">FLAPS: <span className="text-white font-bold">{controls.flaps === 0 ? "0 (CLEAN)" : controls.flaps === 1 ? "1+F" : controls.flaps === 2 ? "2" : "FULL"}</span></div>
        </div>
      </div>

      {/* 3. MAIN GLASS AVIONICS INSTRUMENT SUITE (PFD, ND, ECAM) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-2.5 p-2.5 bg-slate-950 overflow-hidden">
        {/* 3A. PRIMARY FLIGHT DISPLAY (PFD) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 flex flex-col relative shadow-inner overflow-hidden">
          <div className="h-5 border-b border-slate-800 bg-slate-950 flex items-center justify-around text-[10px] font-bold text-emerald-400 font-mono tracking-wider shrink-0 mb-1.5">
            <span>{controls.throttle === "TOGA" ? "MAN TOGA" : controls.throttle === "CLB" ? "SPEED" : "MAN THR"}</span>
            <span>{currentVsi > 100 ? "SRS" : "ALT CRZ"}</span>
            <span>{agl < 50 ? "RWY" : "NAV"}</span>
            <span className="text-cyan-400">AP1</span>
          </div>

          <div className="flex-1 flex items-center justify-between relative min-h-0">
            {/* Speed Tape */}
            <div className="w-14 h-full border-r border-slate-800 bg-slate-950/90 flex flex-col justify-between py-1.5 text-right pr-2 text-xs relative font-mono shrink-0">
              <span className="text-slate-500">{currentSpeed + 20}</span>
              <span className="text-slate-400">{currentSpeed + 10}</span>
              <div className="px-1 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-cyan-300 font-extrabold text-xs text-center shadow-[0_0_8px_#06b6d4]">
                {currentSpeed}
              </div>
              <span className="text-slate-400">{Math.max(0, currentSpeed - 10)}</span>
              <span className="text-slate-500">{Math.max(0, currentSpeed - 20)}</span>

              <div className="absolute left-1 top-1.5 flex flex-col gap-0.5 text-[9px] font-bold">
                <span className="text-cyan-400">1:{v1}</span>
                <span className="text-emerald-400">R:{vr}</span>
                <span className="text-pink-400">2:{v2}</span>
              </div>
            </div>

            {/* Central Artificial Horizon */}
            <div className="flex-1 h-full mx-2 border border-slate-800 rounded bg-slate-950 relative overflow-hidden flex items-center justify-center">
              <div
                className="w-full flex flex-col items-center gap-2.5 transition-transform"
                style={{ transform: `translateY(${controls.pitchAngle * 3}px)` }}
              >
                <div className="w-12 h-[1px] bg-slate-600" />
                <div className="w-8 h-[1px] bg-slate-600" />
                <div className="w-28 h-[2px] bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                <div className="w-8 h-[1px] bg-slate-600" />
                <div className="w-12 h-[1px] bg-slate-600" />
              </div>

              <div className="absolute w-12 h-3 flex items-center justify-between pointer-events-none">
                <div className="w-3 h-1 bg-amber-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <div className="w-3 h-1 bg-amber-400" />
              </div>

              <div className="absolute bottom-1 text-[10px] text-slate-500 font-mono">
                PITCH: {controls.pitchAngle.toFixed(1)}°
              </div>
            </div>

            {/* Altitude Tape */}
            <div className="w-16 h-full border-l border-slate-800 bg-slate-950/90 flex flex-col justify-between py-1.5 text-left pl-2 text-xs relative font-mono shrink-0">
              <span className="text-slate-500">{currentAlt + 400}</span>
              <span className="text-slate-400">{currentAlt + 200}</span>
              <div className="px-1 py-0.5 rounded bg-emerald-950 border border-emerald-400 text-emerald-300 font-extrabold text-xs text-center shadow-[0_0_8px_#10b981]">
                {currentAlt}
              </div>
              <span className="text-slate-400">{Math.max(0, currentAlt - 200)}</span>
              <span className="text-slate-500">{Math.max(0, currentAlt - 400)}</span>

              <div className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">
                {currentVsi > 0 ? `+${currentVsi}` : currentVsi}
              </div>
            </div>
          </div>
        </div>

        {/* 3B. NAVIGATION DISPLAY (ND) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
          <div className="w-full flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1">
            <span className="text-cyan-400">HSI COMPASS</span>
            <span className="text-amber-400">TRK {String(currentHeading).padStart(3, "0")}°</span>
          </div>

          <div className="relative w-36 h-36 rounded-full border-2 border-slate-700 bg-slate-950 flex items-center justify-center shadow-lg my-auto">
            <div
              className="absolute inset-0 rounded-full transition-transform duration-100"
              style={{ transform: `rotate(${-currentHeading}deg)` }}
            >
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-cyan-400">N</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500">S</span>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">E</span>
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">W</span>
            </div>

            <div className="w-20 h-20 rounded-full border border-dashed border-slate-800" />
            <div className="absolute text-amber-400">
              <Plane className="w-5 h-5 fill-current" />
            </div>
            <div className="absolute top-1 text-cyan-400">▲</div>
          </div>

          <div className="w-full flex items-center justify-between text-[10px] text-slate-400 mt-1">
            <span>RNG: 10 NM</span>
            <span className="text-emerald-400">GS: {currentSpeed} KT</span>
          </div>
        </div>

        {/* 3C. ECAM ENGINE & SYSTEM GAUGES */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2.5 flex flex-col justify-between shadow-inner font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[11px] font-bold text-slate-400">
            <span className="text-amber-400">ECAM ENGINE STATUS</span>
            <span className={controls.parkingBrake ? "text-amber-500 font-black" : "text-emerald-400"}>
              {controls.parkingBrake ? "PARK BRK SET" : "BRAKES REL"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 my-1">
            {/* Engine 1 */}
            <div className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-center space-y-0.5">
              <span className="text-[10px] font-bold text-cyan-400 block">ENG 1</span>
              <div className="text-lg font-extrabold text-white">
                {controls.engine1N1.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">%</span>
              </div>
              <div className="text-[10px] text-slate-400">
                N2: <span className="text-white font-bold">{controls.engine1N2.toFixed(0)}%</span> · <span className="text-amber-400 font-bold">{controls.engine1Egt.toFixed(0)}°C</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                <div className="bg-cyan-400 h-full transition-all" style={{ width: `${controls.engine1N1}%` }} />
              </div>
            </div>

            {/* Engine 2 */}
            <div className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-center space-y-0.5">
              <span className="text-[10px] font-bold text-cyan-400 block">ENG 2</span>
              <div className="text-lg font-extrabold text-white">
                {controls.engine2N1.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">%</span>
              </div>
              <div className="text-[10px] text-slate-400">
                N2: <span className="text-white font-bold">{controls.engine2N2.toFixed(0)}%</span> · <span className="text-amber-400 font-bold">{controls.engine2Egt.toFixed(0)}°C</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                <div className="bg-cyan-400 h-full transition-all" style={{ width: `${controls.engine2N1}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
            <div className="p-1 rounded border border-slate-800 bg-slate-950">
              <span className="text-slate-500 block">APU GEN</span>
              <span className={`font-bold ${controls.apuAvail ? "text-emerald-400" : "text-slate-500"}`}>
                {controls.apuAvail ? "AVAIL" : "OFF"}
              </span>
            </div>
            <div className="p-1 rounded border border-slate-800 bg-slate-950">
              <span className="text-slate-500 block">FLAPS</span>
              <span className="font-bold text-cyan-400">
                {controls.flaps === 0 ? "0" : controls.flaps === 1 ? "1+F" : controls.flaps === 2 ? "2" : "FULL"}
              </span>
            </div>
            <div className="p-1 rounded border border-slate-800 bg-slate-950">
              <span className="text-slate-500 block">TILLER</span>
              <span className="font-bold text-amber-400">
                {controls.tillerAngle.toFixed(0)}°
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PILOT ATC COMMUNICATIONS CONTROL DECK (DIRECT ACCESS FOR PILOT) */}
      <div className="border-t border-slate-800 bg-slate-950 px-4 py-2 flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-xs font-black text-white tracking-wider uppercase font-mono">
              PILOT ATC CLEARANCE OPTIONS
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
              COM1: {frequencyLabel}
            </span>
          </div>

          {lastRadioMsg && (
            <div className="text-[11px] font-mono text-slate-300 truncate max-w-xl hidden md:flex items-center gap-1.5">
              <span className="text-amber-400 font-bold shrink-0">{lastRadioMsg.sender}:</span>
              <span className="truncate">"{lastRadioMsg.text}"</span>
            </div>
          )}
        </div>

        {/* 6 Explicit ATC Options for Pilot */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono">
          {/* 1. IFR Clearance */}
          <button
            onClick={() => handleRadioOption("IFR_CLEARANCE")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              isIfrCleared
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-400"
                : "border-cyan-500 bg-cyan-950 text-cyan-300 shadow-[0_0_10px_#06b6d4] ring-1 ring-cyan-400"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[1]</span>
              <span className="text-cyan-400 font-bold">DELIVERY</span>
            </div>
            <span className="text-xs font-black">
              {isIfrCleared ? "✓ IFR Cleared" : "Request IFR"}
            </span>
          </button>

          {/* 2. Pushback */}
          <button
            onClick={() => handleRadioOption("PUSHBACK")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              playerAc?.state === "PUSHING_BACK" || playerAc?.state === "PUSHBACK_COMPLETE"
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-400"
                : isIfrCleared && playerAc?.state === "AT_GATE"
                ? "border-amber-500 bg-amber-950 text-amber-300 shadow-[0_0_10px_#f59e0b] ring-1 ring-amber-400 animate-pulse"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-500"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[2]</span>
              <span className="text-amber-400 font-bold">GROUND</span>
            </div>
            <span className="text-xs font-black">
              {playerAc?.state === "PUSHING_BACK" ? "Pushing Back..." : "Request Pushback"}
            </span>
          </button>

          {/* 3. Taxi */}
          <button
            onClick={() => handleRadioOption("TAXI")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              playerAc?.state === "TAXIING"
                ? "border-emerald-600 bg-emerald-950 text-emerald-300 shadow-[0_0_10px_#10b981]"
                : playerAc?.state === "PUSHBACK_COMPLETE" || playerAc?.state === "HOLD_POSITION"
                ? "border-emerald-500 bg-emerald-950/80 text-emerald-300 ring-1 ring-emerald-400 animate-pulse"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-emerald-500"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[3]</span>
              <span className="text-emerald-400 font-bold">GROUND</span>
            </div>
            <span className="text-xs font-black">
              {playerAc?.state === "TAXIING" ? "Taxiing..." : "Request Taxi"}
            </span>
          </button>

          {/* 4. Line Up & Wait */}
          <button
            onClick={() => handleRadioOption("LINE_UP")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              playerAc?.state === "LINE_UP_WAIT"
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-400"
                : playerAc?.state === "HOLDING_SHORT"
                ? "border-amber-500 bg-amber-950 text-amber-300 ring-1 ring-amber-400 animate-pulse"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-amber-500"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[4]</span>
              <span className="text-amber-400 font-bold">TOWER</span>
            </div>
            <span className="text-xs font-black">
              {playerAc?.state === "LINE_UP_WAIT" ? "Lined Up" : "Line Up Runway"}
            </span>
          </button>

          {/* 5. Takeoff Clearance */}
          <button
            onClick={() => handleRadioOption("TAKEOFF")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              playerAc?.state === "TAKEOFF_CLEARED" || playerAc?.state === "TAKEOFF_ROLL"
                ? "border-rose-500 bg-rose-950 text-rose-300 shadow-[0_0_10px_#f43f5e] ring-1 ring-rose-400 animate-pulse"
                : playerAc?.state === "LINE_UP_WAIT" || playerAc?.state === "HOLDING_SHORT"
                ? "border-rose-500 bg-rose-950/60 text-rose-300 ring-1 ring-rose-400"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-rose-500"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[5]</span>
              <span className="text-rose-400 font-bold">TOWER</span>
            </div>
            <span className="text-xs font-black">
              {playerAc?.state === "TAKEOFF_ROLL" ? "Rolling TOGA" : "Takeoff Clear"}
            </span>
          </button>

          {/* 6. Airborne & Fly */}
          <button
            onClick={() => handleRadioOption("CLIMB")}
            className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              playerAc?.state === "CLIMB"
                ? "border-sky-500 bg-sky-950 text-sky-300 shadow-[0_0_10px_#0ea5e9] ring-1 ring-sky-400"
                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">[6]</span>
              <span className="text-sky-400 font-bold">DEP</span>
            </div>
            <span className="text-xs font-black">
              {playerAc?.state === "CLIMB" ? "Climbing FL340" : "Fly / Climb"}
            </span>
          </button>
        </div>
      </div>

      {/* 5. LOWER PEDESTAL CONTROLS */}
      <footer className="border-t border-slate-800 bg-slate-900/95 px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
        {/* Clickable System Switches with Real Sounds */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Battery */}
          <button
            onClick={handleToggleBattery}
            className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer ${
              controls.battery1
                ? "border-emerald-500 bg-emerald-950 text-emerald-400 shadow-[0_0_8px_#10b981]"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            BAT 1&2: {controls.battery1 ? "ON" : "OFF"}
          </button>

          {/* APU Master */}
          <button
            onClick={handleToggleApu}
            className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer ${
              controls.apuMaster
                ? "border-emerald-500 bg-emerald-950 text-emerald-400 shadow-[0_0_8px_#10b981]"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            APU: {controls.apuAvail ? "AVAIL" : controls.apuMaster ? "START" : "OFF"}
          </button>

          {/* Engine 1 & 2 Master */}
          <button
            onClick={handleToggleEngine}
            className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer ${
              controls.engine1Master
                ? "border-cyan-500 bg-cyan-950 text-cyan-300 shadow-[0_0_8px_#06b6d4]"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            ENG MASTER: {controls.engine1Master ? "RUN" : "OFF"}
          </button>

          {/* Parking Brake */}
          <button
            onClick={handleToggleParkingBrake}
            className={`px-3 py-1.5 rounded text-xs font-black border transition-all cursor-pointer ${
              controls.parkingBrake
                ? "border-amber-500 bg-amber-950 text-amber-400 shadow-[0_0_8px_#f59e0b]"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            PARK BRAKE: {controls.parkingBrake ? "SET [B]" : "REL [B]"}
          </button>

          {/* Flaps */}
          <button
            onClick={handleToggleFlaps}
            className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
          >
            FLAPS: {controls.flaps === 0 ? "0" : controls.flaps === 1 ? "1+F" : controls.flaps === 2 ? "2" : "FULL"} [F]
          </button>
        </div>

        {/* Throttle Quadrant Detent Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-800 bg-slate-950">
          <span className="text-[10px] text-slate-500 px-1 font-bold">THRUST [W/S]:</span>
          {(["IDLE", "CLB", "FLEX", "TOGA"] as ThrottleDetent[]).map((mode) => {
            const active = controls.throttle === mode;
            return (
              <button
                key={mode}
                onClick={() => handleSelectThrottle(mode)}
                className={`px-2 py-1 rounded text-xs font-black transition-all cursor-pointer ${
                  active
                    ? mode === "TOGA"
                      ? "bg-rose-600 text-white shadow-[0_0_10px_#e11d48]"
                      : "bg-cyan-500 text-black shadow-[0_0_10px_#06b6d4]"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </footer>

      {/* 6. RADAR MINI-MAP OVERLAY MODAL (Toggleable via [M] Key) */}
      {showRadarMiniMap && (
        <div className="fixed inset-4 sm:inset-10 z-50 rounded-2xl border-2 border-cyan-500 bg-slate-950/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 border-b border-cyan-800 bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                ATC SURFACE RADAR MINI-MAP · {sim.airport.icao} ({sim.airport.name})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Press [M] to close</span>
              <button
                onClick={() => setShowRadarMiniMap(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            <RadarScopeCanvas />
          </div>
        </div>
      )}

      {/* 7. ELECTRONIC CHECKLIST (ECL) DRAWER */}
      <PilotChecklistDrawer
        isOpen={showChecklist}
        onClose={() => setShowChecklist(false)}
      />
    </div>
  );
}
