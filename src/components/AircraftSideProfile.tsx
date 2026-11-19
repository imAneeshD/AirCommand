import React from "react";
import type { AircraftTypeSpec, AirlineLivery } from "../data/aircraftCatalog.ts";
import type { Aircraft } from "../types/atc.ts";
import {
  computeAircraftPitchDeg,
  getAglAltitudeFt,
  isSurfaceAircraft,
} from "../utils/telemetry.ts";

interface AircraftSideProfileProps {
  aircraft: Aircraft;
  spec: AircraftTypeSpec;
  livery: AirlineLivery;
  registration: string;
  elevationFt: number;
  theme: "light" | "dark";
  embedded?: boolean;
  isLoadingPhoto?: boolean;
}

type AirframeCategory =
  | "A380_DOUBLE_DECK"
  | "B747_HUMP"
  | "MILITARY_HIGH_WING"
  | "TURBOPROP_HIGH_WING"
  | "TRIJET_MD11"
  | "WIDEBODY_TWIN"
  | "NARROWBODY_TWIN";

function detectAirframeCategory(spec: AircraftTypeSpec): AirframeCategory {
  const code = (spec.code || "").toUpperCase();
  if (code === "A388") return "A380_DOUBLE_DECK";
  if (code === "B744" || code === "B748") return "B747_HUMP";
  if (code === "C17" || code === "C130" || code === "A400" || code === "K35R") {
    return "MILITARY_HIGH_WING";
  }
  if (spec.airframeStyle === "TURBOPROP_REGIONAL" || code === "AT76" || code === "DH8D") {
    return "TURBOPROP_HIGH_WING";
  }
  if (spec.airframeStyle === "TRIJET_MD11" || code === "MD11") {
    return "TRIJET_MD11";
  }
  if (spec.airframeStyle === "WIDE_BOEING" || spec.airframeStyle === "WIDE_AIRBUS") {
    return "WIDEBODY_TWIN";
  }
  return "NARROWBODY_TWIN";
}

export const AircraftSideProfile: React.FC<AircraftSideProfileProps> = ({
  aircraft,
  spec,
  livery,
  registration,
  elevationFt,
  theme,
  embedded = false,
  isLoadingPhoto = false,
}) => {
  const isLight = theme === "light";
  const agl = getAglAltitudeFt(aircraft, elevationFt);
  const gearDown = agl < 2200;
  const onGround = isSurfaceAircraft(aircraft, elevationFt);
  const pitchDeg = computeAircraftPitchDeg(aircraft, elevationFt);
  const liftY = onGround ? 0 : Math.min(10, 3 + (Math.min(agl, 350) / 350) * 6);
  const isCargo = Boolean(
    livery.isCargo ||
      spec.isCargoOnly ||
      spec.code === "B77F" ||
      spec.code === "B748" ||
      spec.code === "MD11"
  );
  const isEmergency =
    aircraft.operationMode === "EMERGENCY_OPERATION" ||
    aircraft.state === "STOPPED_ON_RUNWAY";

  const category = detectAirframeCategory(spec);
  const safeId = aircraft.id.replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `hull_${safeId}`;
  const gradHighlightId = `hull_hi_${safeId}`;
  const metalLipId = `lip_${safeId}`;
  const propBlurId = `prop_${safeId}`;
  const gridPatternId = `cad_grid_${safeId}`;

  // Ground plane baseline is y = 96
  const groundY = 96;

  // Window generators (realistic tinted airliner passenger windows)
  const renderCabinWindows = (
    y: number,
    startX: number,
    endX: number,
    step: number,
    gapMin?: number,
    gapMax?: number
  ) => {
    if (isCargo) return null;
    const windows: React.ReactNode[] = [];
    for (let x = startX; x <= endX; x += step) {
      if (gapMin !== undefined && gapMax !== undefined && x >= gapMin && x <= gapMax) {
        continue;
      }
      windows.push(
        <rect
          key={`win_${x}_${y}`}
          x={x}
          y={y}
          width="2.6"
          height="3.8"
          rx="1"
          fill="#0a121e"
          stroke="rgba(255,255,255,0.24)"
          strokeWidth="0.35"
        />
      );
    }
    return <g>{windows}</g>;
  };

  // Render Passenger / Service Doors
  const renderDoor = (x: number, topY: number, height: number, width = 4.2) => {
    return (
      <g key={`door_${x}_${topY}`}>
        <rect
          x={x}
          y={topY}
          width={width}
          height={height}
          rx="1.4"
          fill="none"
          stroke="rgba(100, 116, 139, 0.55)"
          strokeWidth="0.75"
        />
        {!isCargo && (
          <rect
            x={x + width / 2 - 0.75}
            y={topY + 2.5}
            width="1.5"
            height="2.4"
            rx="0.6"
            fill="#090d16"
          />
        )}
        <line
          x1={x + width - 1}
          y1={topY + height * 0.52}
          x2={x + width - 1}
          y2={topY + height * 0.62}
          stroke="#475569"
          strokeWidth="0.7"
        />
      </g>
    );
  };

  // Render Cargo Loading Doors (for freighters)
  const renderCargoDoor = (x: number, y: number, w: number, h: number) => {
    return (
      <g key={`cargodoor_${x}_${y}`}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="1.5"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="0.8"
          strokeDasharray="3 1.5"
        />
        <text
          x={x + w / 2}
          y={y + h - 2}
          fontSize="3.2"
          fontFamily="monospace"
          fontWeight="bold"
          fill="#f59e0b"
          textAnchor="middle"
        >
          CARGO
        </text>
      </g>
    );
  };

  // Render Precision Engine Turbofan Nacelle
  const renderTurbofan = (
    x: number,
    y: number,
    w: number,
    h: number,
    scale = 1
  ) => {
    const intakeLipW = 3.8 * scale;
    const spinnerCx = x + w - 1.2;
    const spinnerCy = y + h / 2;

    return (
      <g key={`eng_${x}_${y}`}>
        {/* Pylon Mount to Wing */}
        <path
          d={`M ${x + 4} ${y - 4} L ${x + w - 6} ${y - 4} L ${x + w - 10} ${y} L ${x + 6} ${y} Z`}
          fill="#475569"
          stroke="#334155"
          strokeWidth="0.6"
        />
        {/* Primary Cowl */}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={h * 0.35}
          fill={livery.nacelle}
          stroke={isLight ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.25)"}
          strokeWidth="0.8"
        />
        {/* Chrome Intake Lip */}
        <rect
          x={x + w - intakeLipW}
          y={y + 0.3}
          width={intakeLipW}
          height={h - 0.6}
          rx={h * 0.35}
          fill={`url(#${metalLipId})`}
          stroke="#94a3b8"
          strokeWidth="0.4"
        />
        {/* Dark Fan Turbine Core */}
        <ellipse
          cx={x + w - intakeLipW}
          cy={y + h / 2}
          rx={1.3 * scale}
          ry={h * 0.44}
          fill="#06090e"
        />
        {/* Spinner Cone with white spiral indicator */}
        <path
          d={`M ${spinnerCx - 3.8} ${spinnerCy - 1.2} L ${spinnerCx} ${spinnerCy} L ${spinnerCx - 3.8} ${spinnerCy + 1.2} Z`}
          fill="#f1f5f9"
        />
        <circle cx={spinnerCx - 1.2} cy={spinnerCy} r="0.5" fill="#38bdf8" />
        {/* Turbine Exhaust Cone */}
        <path
          d={`M ${x} ${y + 1.8} L ${x - 5 * scale} ${y + 3.2} L ${x - 5 * scale} ${y + h - 3.2} L ${x} ${y + h - 1.8} Z`}
          fill="#334155"
          stroke="#1e293b"
          strokeWidth="0.6"
        />
        <path
          d={`M ${x - 5 * scale} ${y + h * 0.38} L ${x - 8.5 * scale} ${spinnerCy} L ${x - 5 * scale} ${y + h * 0.62} Z`}
          fill="#475569"
        />
      </g>
    );
  };

  // Render Turboprop Nacelle with spinning propeller blur
  const renderTurboprop = (x: number, y: number, w: number, h: number) => {
    const spinnerTipX = x + w + 5.5;
    const spinnerCy = y + h / 2;

    return (
      <g key={`turboprop_${x}_${y}`}>
        {/* Nacelle Cowling */}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="3.5"
          fill={livery.nacelle}
          stroke={isLight ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.25)"}
          strokeWidth="0.8"
        />
        {/* Chin Air Scoop */}
        <path
          d={`M ${x + 6} ${y + h} L ${x + w - 2} ${y + h} L ${x + w} ${y + h + 2} L ${x + 4} ${y + h + 2} Z`}
          fill="#334155"
        />
        {/* Propeller Spinner Cone */}
        <path
          d={`M ${x + w} ${y + 1.2} C ${x + w + 4} ${y + 1.8}, ${spinnerTipX} ${spinnerCy}, ${spinnerTipX} ${spinnerCy} C ${spinnerTipX} ${spinnerCy}, ${x + w + 4} ${y + h - 1.8}, ${x + w} ${y + h - 1.2} Z`}
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth="0.5"
        />
        {/* Spinning Propeller Motion Blur Disc */}
        <ellipse
          cx={x + w + 2.5}
          cy={spinnerCy}
          rx="1.8"
          ry="19"
          fill={`url(#${propBlurId})`}
          stroke="rgba(251, 191, 36, 0.55)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />
        {/* Propeller Blade Tips (Yellow Safety Arcs) */}
        <circle cx={x + w + 2.5} cy={spinnerCy - 17.5} r="1.4" fill="#fbbf24" />
        <circle cx={x + w + 2.5} cy={spinnerCy + 17.5} r="1.4" fill="#fbbf24" />
        {/* Exhaust Stubs */}
        <path
          d={`M ${x} ${y + 2} L ${x - 4} ${y + 3.5} L ${x - 4} ${y + h - 3.5} L ${x} ${y + h - 2} Z`}
          fill="#475569"
        />
      </g>
    );
  };

  // Render Realistic Landing Gear
  const renderLandingGear = (
    noseX: number,
    mainX: number,
    strutTopY: number,
    bogies: "SINGLE" | "DUAL_AXLE" | "TRIPLE_AXLE" | "SPONSON"
  ) => {
    if (!gearDown) return null;
    const wheelR = 4.2;
    const wheelCenterY = groundY - wheelR;
    const strutStroke = isLight ? "#334155" : "#94a3b8";

    return (
      <g key="landing_gear" strokeLinecap="round" strokeLinejoin="round">
        {/* Nose Gear Assembly */}
        <g>
          {/* Main oleo shock strut */}
          <line
            x1={noseX}
            y1={strutTopY}
            x2={noseX}
            y2={wheelCenterY}
            stroke={strutStroke}
            strokeWidth="2.4"
          />
          {/* Torque scissor links */}
          <polyline
            points={`${noseX},${strutTopY + 5} ${noseX + 3.2},${strutTopY + 9} ${noseX},${strutTopY + 13}`}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.2"
          />
          {/* Dual taxi lights */}
          <circle cx={noseX - 1.2} cy={strutTopY + 7} r="1.1" fill="#fef08a" />
          {/* Tire & alloy wheel rim */}
          <circle
            cx={noseX}
            cy={wheelCenterY}
            r="3.5"
            fill="#090d16"
            stroke="#334155"
            strokeWidth="1"
          />
          <circle cx={noseX} cy={wheelCenterY} r="1.4" fill="#cbd5e1" />
          {/* Nose gear door */}
          <path
            d={`M ${noseX + 2.5} ${strutTopY} L ${noseX + 6.5} ${strutTopY + 10} L ${noseX + 5} ${strutTopY + 11} L ${noseX + 1.8} ${strutTopY} Z`}
            fill="#475569"
          />
        </g>

        {/* Main Gear Assembly */}
        <g>
          {/* Vertical strut */}
          <line
            x1={mainX}
            y1={strutTopY}
            x2={mainX}
            y2={wheelCenterY - 1}
            stroke={strutStroke}
            strokeWidth="3.2"
          />
          {/* Angled gear door */}
          <line
            x1={mainX - 8}
            y1={strutTopY + 1}
            x2={mainX - 14}
            y2={strutTopY + 13}
            stroke="#475569"
            strokeWidth="1.8"
          />

          {bogies === "TRIPLE_AXLE" && (
            /* 777 6-wheel triple-axle truck */
            <g>
              <line
                x1={mainX - 12}
                y1={wheelCenterY}
                x2={mainX + 12}
                y2={wheelCenterY}
                stroke="#64748b"
                strokeWidth="2.2"
              />
              {[-11, 0, 11].map((offset) => (
                <g key={`bog_tri_${offset}`}>
                  <circle
                    cx={mainX + offset}
                    cy={wheelCenterY}
                    r={wheelR}
                    fill="#090d16"
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <circle cx={mainX + offset} cy={wheelCenterY} r="1.6" fill="#cbd5e1" />
                  <circle cx={mainX + offset} cy={wheelCenterY} r="0.6" fill="#475569" />
                </g>
              ))}
            </g>
          )}

          {bogies === "DUAL_AXLE" && (
            /* A380, 747, A350, 787 4-wheel dual-axle truck */
            <g>
              <line
                x1={mainX - 7}
                y1={wheelCenterY}
                x2={mainX + 7}
                y2={wheelCenterY}
                stroke="#64748b"
                strokeWidth="2.2"
              />
              {[-6.5, 6.5].map((offset) => (
                <g key={`bog_dual_${offset}`}>
                  <circle
                    cx={mainX + offset}
                    cy={wheelCenterY}
                    r={wheelR}
                    fill="#090d16"
                    stroke="#1e293b"
                    strokeWidth="1"
                  />
                  <circle cx={mainX + offset} cy={wheelCenterY} r="1.6" fill="#cbd5e1" />
                  <circle cx={mainX + offset} cy={wheelCenterY} r="0.6" fill="#475569" />
                </g>
              ))}
            </g>
          )}

          {bogies === "SINGLE" && (
            /* A320, 737 single-axle dual-wheel */
            <g>
              <circle
                cx={mainX}
                cy={wheelCenterY}
                r={wheelR + 0.2}
                fill="#090d16"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <circle cx={mainX} cy={wheelCenterY} r="1.8" fill="#cbd5e1" />
              <circle cx={mainX} cy={wheelCenterY} r="0.7" fill="#475569" />
            </g>
          )}

          {bogies === "SPONSON" && (
            /* ATR 72, C-17 lower fuselage sponson wheels */
            <g>
              <circle
                cx={mainX - 5}
                cy={wheelCenterY}
                r={wheelR}
                fill="#090d16"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <circle cx={mainX - 5} cy={wheelCenterY} r="1.6" fill="#cbd5e1" />
              <circle
                cx={mainX + 5}
                cy={wheelCenterY}
                r={wheelR}
                fill="#090d16"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <circle cx={mainX + 5} cy={wheelCenterY} r="1.6" fill="#cbd5e1" />
            </g>
          )}
        </g>
      </g>
    );
  };

  return (
    <div
      className={
        embedded
          ? "relative w-full h-full overflow-hidden bg-[#0a121e] select-none"
          : "relative rounded-lg border border-[var(--atc-border)] overflow-hidden bg-[#0a121e] shadow-sm select-none"
      }
    >
      <svg
        viewBox="0 0 380 120"
        preserveAspectRatio="xMidYMid meet"
        className={embedded ? "w-full h-full block" : "w-full h-[120px] block"}
        role="img"
        aria-label={`${livery.airlineName} ${spec.model} technical aeronautical blueprint`}
      >
        <defs>
          {/* Technical Aeronautical Blueprint Grid Pattern */}
          <pattern
            id={gridPatternId}
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke={isLight ? "rgba(100,116,139,0.12)" : "rgba(56,189,248,0.06)"}
              strokeWidth="0.5"
            />
            {/* Fine 10px minor tick */}
            <circle
              cx="10"
              cy="10"
              r="0.5"
              fill={isLight ? "rgba(100,116,139,0.18)" : "rgba(56,189,248,0.12)"}
            />
          </pattern>

          {/* Fuselage Cylindrical Curvature Shading */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={livery.fuselage} />
            <stop offset="68%" stopColor={livery.fuselage} />
            <stop offset="100%" stopColor={livery.belly} />
          </linearGradient>

          {/* Fuselage Top Highlight for 3D Crown Reflection */}
          <linearGradient id={gradHighlightId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.48)" />
            <stop offset="25%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Polished Titanium / Chrome Intake Lip */}
          <linearGradient id={metalLipId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="45%" stopColor="#f8fafc" />
            <stop offset="85%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          {/* Spinning Propeller Blur Gradient */}
          <radialGradient id={propBlurId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="60%" stopColor="rgba(203, 213, 225, 0.4)" />
            <stop offset="92%" stopColor="rgba(251, 191, 36, 0.55)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
          </radialGradient>
        </defs>

        {/* Backdrop: Aeronautical Dark Slate / Technical Blueprint */}
        <rect
          x="0"
          y="0"
          width="380"
          height="120"
          fill={isLight ? "#f8fafc" : "#090f1a"}
        />
        <rect
          x="0"
          y="0"
          width="380"
          height="120"
          fill={`url(#${gridPatternId})`}
        />

        {/* Precision Engineering Dimension Lines & Datum Markers */}
        <g
          stroke={isLight ? "rgba(100,116,139,0.25)" : "rgba(56,189,248,0.18)"}
          strokeWidth="0.6"
          strokeDasharray="2 2"
        >
          {/* Horizontal Reference Baseline (Ground plane) */}
          <line x1="10" y1={groundY} x2="370" y2={groundY} strokeWidth="0.8" strokeDasharray="none" />
          {/* Engineering dimension ticks */}
          <line x1="60" y1={groundY - 4} x2="60" y2={groundY + 4} strokeDasharray="none" />
          <line x1="340" y1={groundY - 4} x2="340" y2={groundY + 4} strokeDasharray="none" />
          {/* Vertical Centerline Datum */}
          <line x1="200" y1="12" x2="200" y2={groundY} />
        </g>

        {/* Technical Blueprint Typography Callouts in Background */}
        <g
          fontFamily="monospace"
          fontSize="5"
          fill={isLight ? "rgba(71,85,105,0.45)" : "rgba(148,163,184,0.35)"}
          letterSpacing="0.8"
        >
          <text x="14" y="114">ELEVATION VIEW · SCALE 1:200</text>
          <text x="200" y="114" textAnchor="middle">
            L: {spec.length} • B: {spec.wingspan}
          </text>
          <text x="366" y="114" textAnchor="end">
            ICAO {spec.code}
          </text>
        </g>

        {/* Soft Precision Aircraft Ground Contact Shadow */}
        {onGround && (
          <ellipse
            cx="224"
            cy={groundY + 0.5}
            rx="124"
            ry="2.5"
            fill={isLight ? "rgba(15, 23, 42, 0.22)" : "rgba(0, 0, 0, 0.7)"}
          />
        )}

        {/* =========================================================================
            AIRCRAFT AIRFRAME GROUP (Rotated by pitch and lifted when airborne)
            ========================================================================= */}
        <g
          transform={`translate(0 ${(-liftY).toFixed(1)}) rotate(${(-pitchDeg).toFixed(
            1
          )} 200 68)`}
        >
          {/* =====================================================================
              CASE 1: AIRBUS A380-800 SUPERJUMBO (Full Double Deck, 4 Heavy Engines)
              ===================================================================== */}
          {category === "A380_DOUBLE_DECK" && (
            <g id="a380_superjumbo">
              {/* Stabilizer (far side) */}
              <path
                d="M 108 58 L 52 50 L 64 50 L 118 60 Z"
                fill={livery.tailBg}
                opacity="0.75"
              />
              {/* Massive Double-Deck Vertical Stabilizer */}
              <path
                d="M 94 36 L 42 12 L 62 12 L 132 40 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              {/* Tail Livery Swatch */}
              <path
                d="M 52 16 L 68 16 L 122 39 L 104 39 Z"
                fill={livery.tailAccent}
              />
              {/* Rudder hinge seam */}
              <line x1="58" y1="12" x2="108" y2="38" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />

              {/* Landing Gear */}
              {renderLandingGear(314, 192, 76, "DUAL_AXLE")}

              {/* Main Double-Deck Fuselage */}
              <path
                d="M 72 62
                   L 102 36
                   L 302 36
                   C 328 36, 342 46, 344 58
                   C 345 68, 334 78, 308 78
                   L 112 78
                   L 66 64 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              {/* Top Crown Metallic Highlight */}
              <path
                d="M 102 36 L 302 36 C 322 36, 336 42, 340 48 L 102 44 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Lower Cheatline */}
              <path
                d="M 98 73 L 314 73 L 312 75.5 L 96 75.5 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* Cockpit Windshield (between upper & main deck) */}
              <path
                d="M 326 49 L 338 51.5 L 341 55.5 L 326 55.5 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <line x1="332" y1="50" x2="332" y2="55.5" stroke={livery.fuselage} strokeWidth="0.8" />

              {/* Double Deck Windows: Upper Deck (y=42) + Main Deck (y=60) */}
              {renderCabinWindows(42, 120, 296, 6.2, 186, 202)}
              {renderCabinWindows(60, 114, 308, 6.2, 184, 206)}

              {/* Doors: Upper Deck Doors + Main Deck Doors */}
              {renderDoor(122, 38, 12)}
              {renderDoor(210, 38, 12)}
              {renderDoor(290, 38, 12)}
              {renderDoor(116, 54, 14)}
              {renderDoor(206, 54, 14)}
              {renderDoor(304, 54, 14)}

              {/* Airline Billboard Title */}
              <text
                x="218"
                y="52"
                fontSize="8"
                fontWeight="900"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.8"
              >
                {livery.title}
              </text>
              <text
                x="88"
                y="71"
                fontSize="5.5"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Low Wing Root & Swept Wing with Wingtip Fence */}
              <path
                d="M 166 74 L 232 74 L 218 83 L 138 83 Z"
                fill={isLight ? "#cbd5e1" : "#475569"}
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <polygon
                points="136,80 134,88 139,87 138,81"
                fill={livery.tailAccent}
              />

              {/* 4 Massive High-Bypass Turbofans (2 on visible wing side) */}
              {renderTurbofan(172, 76, 24, 11.5, 0.9)}
              {renderTurbofan(214, 80, 28, 13.5, 1.05)}

              {/* Horizontal Tailplane (near side) */}
              <path
                d="M 106 64 L 46 56 L 54 53 L 122 62 Z"
                fill={isLight ? "#cbd5e1" : "#64748b"}
                stroke="#475569"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* =====================================================================
              CASE 2: BOEING 747 QUEEN OF THE SKIES (Upper Deck Hump, 4 Heavy Engines)
              ===================================================================== */}
          {category === "B747_HUMP" && (
            <g id="b747_queen">
              {/* Horizontal Stabilizer (far side) */}
              <path
                d="M 104 56 L 48 48 L 60 48 L 114 58 Z"
                fill={livery.tailBg}
                opacity="0.75"
              />
              {/* Swept Boeing Vertical Fin */}
              <path
                d="M 92 38 L 44 14 L 62 14 L 136 44 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 52 18 L 68 18 L 124 43 L 106 43 Z"
                fill={livery.tailAccent}
              />

              {/* Landing Gear */}
              {renderLandingGear(314, 194, 73, "DUAL_AXLE")}

              {/* Boeing 747 Fuselage with Upper Deck Hump */}
              <path
                d="M 70 60
                   L 98 44
                   L 220 44
                   C 238 42, 252 35, 276 35
                   L 302 35
                   C 324 35, 338 42, 342 56
                   C 344 67, 332 75, 308 75
                   L 108 75
                   L 66 63 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              <path
                d="M 98 44 L 220 44 C 238 42, 252 35, 276 35 L 302 35 C 320 35, 332 40, 336 46 L 98 50 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Cheatline */}
              <path
                d="M 96 70 L 312 70 L 310 72.5 L 94 72.5 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* 747 Cockpit Windows */}
              <path
                d="M 314 41 L 328 43 L 331 47 L 314 47 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <line x1="322" y1="42" x2="322" y2="47" stroke={livery.fuselage} strokeWidth="0.8" />

              {/* Upper Deck & Main Deck Windows */}
              {!isCargo && renderCabinWindows(41, 266, 300, 5.5)}
              {renderCabinWindows(58, 110, 306, 6, 186, 204)}

              {/* Doors */}
              {renderDoor(112, 51, 14)}
              {renderDoor(202, 51, 14)}
              {renderDoor(300, 51, 14)}

              {/* Cargo Nose Visor Seam Line */}
              {isCargo && (
                <>
                  <path
                    d="M 318 36 L 318 73"
                    stroke="#f59e0b"
                    strokeWidth="0.8"
                    strokeDasharray="2 1.5"
                  />
                  {renderCargoDoor(130, 50, 24, 15)}
                </>
              )}

              {/* Airline Billboard Title */}
              <text
                x="200"
                y="52"
                fontSize={isCargo ? "9.5" : "7.5"}
                fontWeight="900"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.8"
              >
                {livery.title}
              </text>
              <text
                x="88"
                y="68"
                fontSize="5.5"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Swept Wing with Winglet */}
              <path
                d="M 164 71 L 230 71 L 216 79 L 138 79 Z"
                fill={isLight ? "#cbd5e1" : "#475569"}
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <polygon
                points="138,76 134,64 138,64 142,76"
                fill={livery.tailAccent}
              />

              {/* 4 Underslung Turbofans (Outer #1 + Inner #2) */}
              {renderTurbofan(170, 72, 23, 11, 0.9)}
              {renderTurbofan(212, 76, 27, 13, 1.05)}

              {/* Near Horizontal Stabilizer */}
              <path
                d="M 102 61 L 44 54 L 52 51 L 118 60 Z"
                fill={isLight ? "#cbd5e1" : "#64748b"}
                stroke="#475569"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* =====================================================================
              CASE 3: MILITARY HEAVY TRANSPORT (C-17, C-130, A400M)
              High-Wing, T-Tail, Sponson Gear, Swept Rear Ramp
              ===================================================================== */}
          {category === "MILITARY_HIGH_WING" && (
            <g id="military_heavy">
              {/* High T-Tail Stabilizer */}
              <path
                d="M 86 15 L 42 12 L 44 9 L 92 12 Z"
                fill={livery.tailBg}
                stroke="#475569"
                strokeWidth="0.6"
              />
              {/* Massive Swept Vertical Fin */}
              <path
                d="M 86 42 L 56 12 L 72 12 L 126 42 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 64 16 L 76 16 L 116 41 L 102 41 Z"
                fill={livery.tailAccent}
              />

              {/* High-Wing Shoulder */}
              <path
                d="M 172 40 L 254 40 L 244 48 L 162 48 Z"
                fill="#475569"
                stroke="#334155"
                strokeWidth="0.7"
              />

              {/* Landing Gear */}
              {renderLandingGear(312, 198, 76, "SPONSON")}

              {/* Fuselage with Upswept Ramp */}
              <path
                d="M 78 50
                   L 124 42
                   L 302 42
                   C 324 42, 338 48, 342 58
                   C 343 68, 332 76, 308 76
                   L 134 76
                   L 74 54 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              {/* Sponson Pod */}
              <path
                d="M 174 72 Q 200 68 226 72 L 224 78 Q 200 81 176 78 Z"
                fill="#334155"
                stroke="#1e293b"
                strokeWidth="0.7"
              />

              {/* Rear Ramp Seam */}
              <line
                x1="86"
                y1="52"
                x2="134"
                y2="76"
                stroke="#64748b"
                strokeWidth="0.8"
                strokeDasharray="2 1.5"
              />

              {/* Cockpit */}
              <path
                d="M 324 48 L 336 50.5 L 338 54.5 L 324 54.5 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />

              {renderDoor(304, 50, 14)}
              {renderDoor(116, 54, 12)}

              <text
                x="220"
                y="58"
                fontSize="8.5"
                fontWeight="900"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="1"
              >
                {livery.title}
              </text>
              <text
                x="88"
                y="52"
                fontSize="5.2"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {spec.code === "C130" || spec.code === "A400" ? (
                <>
                  {renderTurboprop(180, 48, 22, 9)}
                  {renderTurboprop(220, 51, 25, 10.5)}
                </>
              ) : (
                <>
                  {renderTurbofan(182, 50, 23, 11, 0.9)}
                  {renderTurbofan(222, 53, 27, 13, 1.05)}
                </>
              )}
            </g>
          )}

          {/* =====================================================================
              CASE 4: REGIONAL TURBOPROP (ATR 72, Dash 8 Q400)
              High-Wing, T-Tail, Sponson Gear, Twin Turboprops with Spinning Blades
              ===================================================================== */}
          {category === "TURBOPROP_HIGH_WING" && (
            <g id="regional_turboprop">
              {/* High T-Tail Stabilizer */}
              <path
                d="M 94 18 L 54 15 L 56 12 L 102 15 Z"
                fill={livery.tailBg}
                stroke="#475569"
                strokeWidth="0.6"
              />
              {/* T-Tail Vertical Fin */}
              <path
                d="M 90 48 L 64 16 L 78 16 L 128 48 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 70 20 L 82 20 L 118 47 L 104 47 Z"
                fill={livery.tailAccent}
              />

              {/* High-Wing Section */}
              <path
                d="M 176 46 L 244 46 L 238 52 L 170 52 Z"
                fill="#475569"
                stroke="#334155"
                strokeWidth="0.6"
              />

              {/* Landing Gear */}
              {renderLandingGear(310, 196, 73, "SPONSON")}

              {/* Turboprop Fuselage */}
              <path
                d="M 80 58
                   L 116 48
                   L 302 48
                   C 322 48, 336 53, 338 61
                   C 339 69, 328 73, 306 73
                   L 116 73
                   L 76 60 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.35)" : "rgba(226, 232, 240, 0.3)"}
                strokeWidth="1"
              />
              <path
                d="M 116 48 L 302 48 C 318 48, 330 52, 334 56 L 116 52 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Sponson Pod */}
              <path
                d="M 182 70 Q 198 67 214 70 L 212 75 Q 198 77 184 75 Z"
                fill="#334155"
                stroke="#1e293b"
                strokeWidth="0.6"
              />

              {/* Cheatline */}
              <path
                d="M 108 69 L 314 69 L 312 71 L 106 71 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* Cockpit Windshield */}
              <path
                d="M 320 53 L 332 55 L 334 58.5 L 320 58.5 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />

              {/* Windows */}
              {renderCabinWindows(56, 122, 298, 5.8, 184, 204)}

              {/* Doors */}
              {renderDoor(120, 52, 14)}
              {renderDoor(294, 52, 14)}

              {/* Airline Branding */}
              <text
                x="210"
                y="59"
                fontSize="7"
                fontWeight="800"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.6"
              >
                {livery.title}
              </text>
              <text
                x="92"
                y="67"
                fontSize="5"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Turboprop Engine with Spinning Propeller Blur */}
              {renderTurboprop(184, 49, 26, 10.5)}
            </g>
          )}

          {/* =====================================================================
              CASE 5: MD-11 TRI-JET HEAVY (Tail-Mounted #2 Engine + Wing Turbofans)
              ===================================================================== */}
          {category === "TRIJET_MD11" && (
            <g id="md11_trijet">
              {/* Stabilizer (far side) */}
              <path
                d="M 100 56 L 46 48 L 56 48 L 110 58 Z"
                fill={livery.tailBg}
                opacity="0.75"
              />
              {/* Tail Vertical Fin */}
              <path
                d="M 88 32 L 48 14 L 64 14 L 124 38 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 56 18 L 70 18 L 112 37 L 98 37 Z"
                fill={livery.tailAccent}
              />

              {/* #2 DORSAL TAIL ENGINE POD */}
              <g id="tail_engine_2">
                <rect
                  x="72"
                  y="34"
                  width="44"
                  height="13"
                  rx="4.5"
                  fill={livery.fuselage}
                  stroke="#475569"
                  strokeWidth="0.8"
                />
                <ellipse cx="116" cy="40.5" rx="2" ry="5.8" fill="#334155" />
                <rect x="114" y="34.5" width="3.5" height="12" rx="2" fill={`url(#${metalLipId})`} />
                <path
                  d="M 72 36.5 L 63 38.5 L 63 42.5 L 72 44.5 Z"
                  fill="#1e293b"
                />
                <path d="M 63 39.5 L 58 40.5 L 63 41.5 Z" fill="#475569" />
              </g>

              {/* Landing Gear */}
              {renderLandingGear(312, 194, 73, "DUAL_AXLE")}

              {/* Fuselage */}
              <path
                d="M 70 60
                   L 102 46
                   L 302 46
                   C 324 46, 338 52, 342 61
                   C 344 70, 332 75, 306 75
                   L 108 75
                   L 66 63 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              <path
                d="M 102 46 L 302 46 C 320 46, 332 50, 336 55 L 102 50 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Cheatline */}
              <path
                d="M 96 70 L 312 70 L 310 72.5 L 94 72.5 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* Cockpit Windshield */}
              <path
                d="M 322 51 L 334 53 L 336 57 L 322 57 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />

              {/* Windows & Doors */}
              {!isCargo ? (
                <>
                  {renderCabinWindows(58, 114, 304, 6, 186, 206)}
                  {renderDoor(116, 51, 14)}
                  {renderDoor(206, 51, 14)}
                  {renderDoor(300, 51, 14)}
                </>
              ) : (
                <>
                  {renderCargoDoor(210, 50, 24, 15)}
                  {renderDoor(302, 51, 14)}
                </>
              )}

              {/* Airline Title */}
              <text
                x="200"
                y="53"
                fontSize={isCargo ? "9.5" : "7.5"}
                fontWeight="900"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.8"
              >
                {livery.title}
              </text>
              <text
                x="88"
                y="68"
                fontSize="5.5"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Wing & Blended Winglets */}
              <path
                d="M 164 71 L 230 71 L 216 79 L 138 79 Z"
                fill={isLight ? "#cbd5e1" : "#475569"}
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <polygon
                points="138,76 134,62 138,62 142,76"
                fill={livery.tailAccent}
              />

              {/* Underwing Turbofan */}
              {renderTurbofan(196, 73, 29, 13.5, 1.1)}

              {/* Near Horizontal Stabilizer */}
              <path
                d="M 102 61 L 44 54 L 52 51 L 118 60 Z"
                fill={isLight ? "#cbd5e1" : "#64748b"}
                stroke="#475569"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* =====================================================================
              CASE 6: TWIN-AISLE WIDEBODY (B777, B787, A350, A330)
              Deep Fuselage, Massive Engines, Multi-Wheel Bogies, Raked Wingtips
              ===================================================================== */}
          {category === "WIDEBODY_TWIN" && (
            <g id="widebody_twin">
              {/* Stabilizer (far side) */}
              <path
                d="M 104 56 L 48 48 L 58 48 L 114 58 Z"
                fill={livery.tailBg}
                opacity="0.75"
              />
              {/* Swept Vertical Stabilizer */}
              <path
                d="M 94 40 L 48 16 L 66 16 L 134 44 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 56 20 L 72 20 L 122 43 L 106 43 Z"
                fill={livery.tailAccent}
              />

              {/* Landing Gear */}
              {renderLandingGear(
                314,
                194,
                73,
                spec.code === "B77W" || spec.code === "B772" || spec.code === "B77F"
                  ? "TRIPLE_AXLE"
                  : "DUAL_AXLE"
              )}

              {/* Widebody Fuselage */}
              <path
                d="M 70 60
                   L 102 46
                   L 302 46
                   C 324 46, 338 52, 342 61
                   C 344 70, 332 75, 306 75
                   L 108 75
                   L 66 63 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              <path
                d="M 102 46 L 302 46 C 320 46, 332 50, 336 55 L 102 50 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Cheatline */}
              <path
                d="M 96 70 L 312 70 L 310 72.5 L 94 72.5 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* Modern Glass Cockpit Windshield */}
              <path
                d="M 322 51 L 334 53 L 336 57 L 322 57 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <line x1="329" y1="52" x2="329" y2="57" stroke={livery.fuselage} strokeWidth="0.8" />

              {/* Windows & Doors */}
              {!isCargo ? (
                <>
                  {renderCabinWindows(58, 114, 304, 6, 186, 206)}
                  {renderDoor(116, 51, 14)}
                  {renderDoor(206, 51, 14)}
                  {renderDoor(300, 51, 14)}
                </>
              ) : (
                <>
                  {renderCargoDoor(210, 50, 24, 15)}
                  {renderDoor(302, 51, 14)}
                </>
              )}

              {/* Airline Branding */}
              <text
                x="200"
                y="53"
                fontSize={isCargo ? "9.5" : "7.5"}
                fontWeight="900"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.8"
              >
                {livery.title}
              </text>
              <text
                x="88"
                y="68"
                fontSize="5.5"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Wing & Raked Wingtip */}
              <path
                d="M 164 71 L 230 71 L 216 79 L 138 79 Z"
                fill={isLight ? "#cbd5e1" : "#475569"}
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <polygon
                points="138,76 134,66 138,66 142,76"
                fill={livery.tailAccent}
              />

              {/* Massive High-Bypass GE90 / Trent Engine */}
              {renderTurbofan(196, 73, 30, 14, 1.15)}

              {/* Near Horizontal Stabilizer */}
              <path
                d="M 102 61 L 44 54 L 52 51 L 118 60 Z"
                fill={isLight ? "#cbd5e1" : "#64748b"}
                stroke="#475569"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* =====================================================================
              CASE 7: SINGLE-AISLE NARROWBODY (A320, A321, B737, B738, B38M, E190)
              Sleek Proportional Lines, Single-Axle Dual Wheels, Winglet/Sharklet
              ===================================================================== */}
          {category === "NARROWBODY_TWIN" && (
            <g id="narrowbody_twin">
              {/* Stabilizer (far side) */}
              <path
                d="M 106 58 L 52 50 L 62 50 L 116 60 Z"
                fill={livery.tailBg}
                opacity="0.75"
              />
              {/* Vertical Stabilizer */}
              <path
                d="M 94 44 L 52 18 L 68 18 L 132 46 Z"
                fill={livery.tailBg}
                stroke={isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.22)"}
                strokeWidth="0.8"
              />
              <path
                d="M 60 22 L 74 22 L 122 45 L 108 45 Z"
                fill={livery.tailAccent}
              />

              {/* Landing Gear */}
              {renderLandingGear(310, 196, 71, "SINGLE")}

              {/* Narrowbody Fuselage */}
              <path
                d="M 76 61
                   L 106 48
                   L 302 48
                   C 322 48, 336 53, 338 61
                   C 339 69, 328 73, 304 73
                   L 112 73
                   L 72 63 Z"
                fill={`url(#${gradId})`}
                stroke={isLight ? "rgba(30, 41, 59, 0.4)" : "rgba(226, 232, 240, 0.35)"}
                strokeWidth="1"
              />
              <path
                d="M 106 48 L 302 48 C 318 48, 330 52, 334 56 L 106 51 Z"
                fill={`url(#${gradHighlightId})`}
              />

              {/* Cheatline */}
              <path
                d="M 100 68 L 312 68 L 310 70.5 L 98 70.5 Z"
                fill={livery.cheatline}
                opacity="0.9"
              />

              {/* Cockpit Windshield */}
              <path
                d="M 318 53 L 330 55 L 332 58.5 L 318 58.5 Z"
                fill="#070c14"
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <line x1="325" y1="53.5" x2="325" y2="58.5" stroke={livery.fuselage} strokeWidth="0.8" />

              {/* Windows & Doors */}
              {!isCargo ? (
                <>
                  {renderCabinWindows(57, 118, 300, 5.6, 186, 204)}
                  {renderDoor(120, 51, 13)}
                  {renderDoor(298, 51, 13)}
                </>
              ) : (
                <>
                  {renderCargoDoor(210, 52, 22, 13)}
                  {renderDoor(300, 51, 13)}
                </>
              )}

              {/* Airline Branding */}
              <text
                x="206"
                y="55"
                fontSize={isCargo ? "8.5" : "7"}
                fontWeight="800"
                fontFamily="'Inter', system-ui, sans-serif"
                fill={livery.textColor}
                letterSpacing="0.6"
              >
                {livery.title}
              </text>
              <text
                x="90"
                y="67"
                fontSize="5.2"
                fontWeight="bold"
                fontFamily="monospace"
                fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
              >
                {registration}
              </text>

              {/* Wing & Sharklet */}
              <path
                d="M 166 70 L 226 70 L 214 77 L 142 77 Z"
                fill={isLight ? "#cbd5e1" : "#475569"}
                stroke="#64748b"
                strokeWidth="0.6"
              />
              <polygon
                points="142,75 138,65 142,65 146,75"
                fill={livery.tailAccent}
              />

              {/* CFM LEAP / CFM56 Underwing Turbofan */}
              {renderTurbofan(192, 70, 26, 12, 1)}

              {/* Near Horizontal Stabilizer */}
              <path
                d="M 104 62 L 48 55 L 56 52 L 120 61 Z"
                fill={isLight ? "#cbd5e1" : "#64748b"}
                stroke="#475569"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* =====================================================================
              PRECISION LIGHTING EFFECTS
              ===================================================================== */}
          {/* Upper Fuselage Red Anti-Collision Beacon */}
          <circle
            cx="200"
            cy="46"
            r={isEmergency ? "2.6" : "1.8"}
            fill="#ef4444"
          />
          <circle
            cx="200"
            cy="46"
            r={isEmergency ? "4.5" : "3"}
            fill="#ef4444"
            opacity="0.4"
          />

          {/* Tail Cone White Strobe */}
          <circle cx="68" cy="62" r="1.2" fill="#f8fafc" />

          {/* Wingtip Green Navigation Light */}
          <circle cx="140" cy="74" r="1.3" fill="#22c55e" />
        </g>

        {/* High-Tech Avionics Scan Line (during photometric photo fetching) */}
        {isLoadingPhoto && (
          <g className="animate-pulse">
            <line
              x1="220"
              y1="4"
              x2="220"
              y2="116"
              stroke="#38bdf8"
              strokeWidth="1.5"
              opacity="0.8"
            />
            <rect
              x="200"
              y="4"
              width="40"
              height="112"
              fill="url(#cad_scan_grad)"
              opacity="0.25"
            />
          </g>
        )}
      </svg>

      {/* =========================================================================
          HIGH-CONTRAST FROSTED FLIGHT DECK CHIPS
          ========================================================================= */}
      {/* Top Left: Aircraft Model & Registration */}
      <div className="absolute top-2 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-[var(--atc-surface)]/90 backdrop-blur-md border border-[var(--atc-border)] text-[9px] font-mono font-bold text-[var(--atc-text)] shadow-sm">
          {spec.manufacturer.toUpperCase()} {spec.code}
        </span>
        <span className="px-1.5 py-0.5 rounded-md bg-[var(--atc-surface)]/85 backdrop-blur-md border border-[var(--atc-border)] text-[9px] font-mono font-semibold text-[var(--atc-muted)]">
          {registration}
        </span>
      </div>

      {/* Bottom Left: Live Telemetry AGL & Vertical Rate */}
      <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-[var(--atc-surface)]/90 backdrop-blur-md border border-[var(--atc-border)] text-[9px] font-mono font-semibold text-[var(--atc-text-secondary)] shadow-sm">
          {agl}ft AGL • {pitchDeg > 0 ? `+${pitchDeg}` : pitchDeg}° • {Math.round(aircraft.verticalSpeed)} fpm
        </span>
      </div>

      {/* Top Right: Status Badge */}
      <div className="absolute top-2 right-2.5 z-10 pointer-events-none">
        <span
          className={`px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold backdrop-blur-md shadow-sm ${
            onGround
              ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
              : gearDown
              ? "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)]"
              : "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {onGround ? "ON GROUND" : gearDown ? "GEAR DOWN" : "CRUISE / CLIMB"}
        </span>
      </div>
    </div>
  );
};
