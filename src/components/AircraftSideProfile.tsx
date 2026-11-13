import React from "react";
import type { AirframeStyle, AircraftTypeSpec, AirlineLivery } from "../data/aircraftCatalog.ts";
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
}

function getFuselageDimensions(style: AirframeStyle): {
  noseX: number;
  tailX: number;
  topY: number;
  botY: number;
  tailTopY: number;
} {
  switch (style) {
    case "WIDE_BOEING":
    case "WIDE_AIRBUS":
      return { noseX: 318, tailX: 74, topY: 46, botY: 73, tailTopY: 18 };
    case "MILITARY_TRANSPORT":
      return { noseX: 315, tailX: 72, topY: 45, botY: 74, tailTopY: 16 };
    case "TURBOPROP_REGIONAL":
      return { noseX: 304, tailX: 84, topY: 51, botY: 69, tailTopY: 24 };
    case "TRIJET_MD11":
      return { noseX: 316, tailX: 72, topY: 47, botY: 73, tailTopY: 18 };
    case "NARROW_AIRBUS":
      return { noseX: 308, tailX: 80, topY: 49, botY: 70, tailTopY: 22 };
    case "NARROW_BOEING":
    default:
      return { noseX: 310, tailX: 80, topY: 49, botY: 70, tailTopY: 22 };
  }
}

export const AircraftSideProfile: React.FC<AircraftSideProfileProps> = ({
  aircraft,
  spec,
  livery,
  registration,
  elevationFt,
  theme,
  embedded = false,
}) => {
  const isLight = theme === "light";
  const agl = getAglAltitudeFt(aircraft, elevationFt);
  const gearDown = agl < 2200;
  const onGround = isSurfaceAircraft(aircraft, elevationFt);
  const pitchDeg = computeAircraftPitchDeg(aircraft, elevationFt);
  const liftY = onGround ? 0 : Math.min(10, 4 + (Math.min(agl, 300) / 300) * 6);
  const isCargo = Boolean(livery.isCargo || spec.isCargoOnly);
  const isWide = spec.airframeStyle === "WIDE_BOEING" || spec.airframeStyle === "TRIJET_MD11";
  const isTrijet = spec.airframeStyle === "TRIJET_MD11";
  const isAirbus = spec.airframeStyle === "NARROW_AIRBUS";
  const isEmergency =
    aircraft.operationMode === "EMERGENCY_OPERATION" ||
    aircraft.state === "STOPPED_ON_RUNWAY";

  const dims = getFuselageDimensions(spec.airframeStyle);
  const midY = (dims.topY + dims.botY) / 2;
  const gradId = `hull_${aircraft.id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const skyId = `sky_${aircraft.id.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Window positions along passenger hull
  const windowXs: number[] = [];
  if (!isCargo) {
    for (let x = dims.tailX + 54; x <= dims.noseX - 42; x += 7.5) {
      // Leave small structural gap at wing box
      if (x > 162 && x < 171) continue;
      windowXs.push(x);
    }
  }

  return (
    <div
      className={
        embedded
          ? "relative w-full h-full overflow-hidden bg-[var(--atc-surface-alt)]"
          : "relative rounded-lg border border-[var(--atc-border)] overflow-hidden bg-[var(--atc-surface-alt)] shadow-sm"
      }
    >
      <svg
        viewBox="0 0 360 116"
        preserveAspectRatio="xMidYMid slice"
        className={embedded ? "w-full h-full block" : "w-full h-[112px] block"}
        role="img"
        aria-label={`${livery.airlineName} ${spec.model} aircraft profile`}
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={isLight ? (onGround ? "#e4ded0" : "#dbeafe") : onGround ? "#0c1624" : "#0b1e36"}
            />
            <stop
              offset="74%"
              stopColor={isLight ? (onGround ? "#f5f1e7" : "#f0f9ff") : onGround ? "#122136" : "#112a46"}
            />
            <stop
              offset="100%"
              stopColor={isLight ? "#e2dac8" : "#08101c"}
            />
          </linearGradient>

          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={livery.fuselage} />
            <stop offset="55%" stopColor={livery.fuselage} />
            <stop offset="100%" stopColor={livery.belly} />
          </linearGradient>
        </defs>

        {/* Sky / Apron Studio Backdrop */}
        <rect x="0" y="0" width="360" height="116" fill={`url(#${skyId})`} />

        {/* Subtle horizon ramp / clouds */}
        {onGround ? (
          <>
            <rect
              x="0"
              y="88"
              width="360"
              height="28"
              fill={isLight ? "#dad2c0" : "#0a1320"}
            />
            <line
              x1="0"
              y1="88"
              x2="360"
              y2="88"
              stroke={isLight ? "#bfb59f" : "#1e324d"}
              strokeWidth="1"
            />
            <line
              x1="12"
              y1="100"
              x2="348"
              y2="100"
              stroke={isLight ? "rgba(217, 119, 6, 0.55)" : "rgba(245, 158, 11, 0.45)"}
              strokeWidth="1.5"
              strokeDasharray="10 8"
            />
          </>
        ) : (
          <g opacity={isLight ? 0.5 : 0.16}>
            <ellipse cx="75" cy="94" rx="48" ry="8" fill={isLight ? "#ffffff" : "#93c5fd"} />
            <ellipse cx="260" cy="100" rx="64" ry="10" fill={isLight ? "#ffffff" : "#93c5fd"} />
          </g>
        )}

        {/* Ground Shadow beneath aircraft */}
        {onGround && (
          <ellipse
            cx="198"
            cy="92"
            rx="116"
            ry="5"
            fill={isLight ? "rgba(28, 25, 23, 0.18)" : "rgba(0, 0, 0, 0.5)"}
          />
        )}

        {/* Airframe Group rotated smoothly by true aerodynamic pitch & climb lift */}
        <g transform={`translate(0 ${(-liftY).toFixed(1)}) rotate(${(-pitchDeg).toFixed(1)} 188 64)`}>
        {/* Far Side Horizontal Stabilizer */}
        <path
          d={`M ${dims.tailX + 26} ${midY - 3} L ${dims.tailX - 6} ${midY - 9} L ${dims.tailX + 8} ${midY - 9} L ${dims.tailX + 36} ${midY - 2} Z`}
          fill={livery.tailBg}
          opacity="0.72"
        />

        {/* Vertical Tail Fin */}
        <path
          d={`M ${dims.tailX + 12} ${dims.topY + 2} L ${dims.tailX - 18} ${dims.tailTopY} L ${dims.tailX - 2} ${dims.tailTopY} L ${dims.tailX + 42} ${dims.topY + 2} Z`}
          fill={livery.tailBg}
          stroke={isLight ? "rgba(15,23,42,0.18)" : "rgba(255,255,255,0.14)"}
          strokeWidth="0.7"
        />
        {/* Airline Tail Diagonal Emblem Stripe */}
        <path
          d={`M ${dims.tailX - 9} ${dims.tailTopY + 5} L ${dims.tailX + 3} ${dims.tailTopY + 5} L ${dims.tailX + 32} ${dims.topY + 2} L ${dims.tailX + 18} ${dims.topY + 2} Z`}
          fill={livery.tailAccent}
        />

        {/* MD-11 Tri-Jet #2 Dorsal Tail Engine Pod */}
        {isTrijet && (
          <g>
            <rect
              x={dims.tailX - 6}
              y={dims.topY - 12}
              width="34"
              height="10.5"
              rx="3.5"
              fill={livery.fuselage}
              stroke={isLight ? "#64748b" : "#94a3b8"}
              strokeWidth="0.8"
            />
            <ellipse
              cx={dims.tailX + 27}
              cy={dims.topY - 6.7}
              rx="2"
              ry="4.5"
              fill="#334155"
            />
            <path
              d={`M ${dims.tailX - 6} ${dims.topY - 10} L ${dims.tailX - 13} ${dims.topY - 8.5} L ${dims.tailX - 13} ${dims.topY - 4.5} L ${dims.tailX - 6} ${dims.topY - 3} Z`}
              fill="#475569"
            />
          </g>
        )}

        {/* Landing Gear (Deployed on ground & below 2,200 ft AGL) */}
        {gearDown && (
          <g stroke={isLight ? "#334155" : "#94a3b8"} strokeLinecap="round">
            {/* Nose Gear */}
            <line x1={dims.noseX - 28} y1={dims.botY - 2} x2={dims.noseX - 26} y2={dims.botY + 14} strokeWidth="2.2" />
            <circle cx={dims.noseX - 26} cy={dims.botY + 15.5} r="3.8" fill="#1e293b" strokeWidth="1" />
            <circle cx={dims.noseX - 26} cy={dims.botY + 15.5} r="1.4" fill="#cbd5e1" stroke="none" />

            {/* Main Landing Gear */}
            <line x1="176" y1={dims.botY - 1} x2="176" y2={dims.botY + 14} strokeWidth="2.6" />
            {isWide ? (
              <>
                <line x1="168" y1={dims.botY + 14.5} x2="184" y2={dims.botY + 14.5} strokeWidth="1.8" />
                <circle cx="170" cy={dims.botY + 15} r="4.4" fill="#1e293b" strokeWidth="1" />
                <circle cx="182" cy={dims.botY + 15} r="4.4" fill="#1e293b" strokeWidth="1" />
                <circle cx="170" cy={dims.botY + 15} r="1.6" fill="#cbd5e1" stroke="none" />
                <circle cx="182" cy={dims.botY + 15} r="1.6" fill="#cbd5e1" stroke="none" />
              </>
            ) : (
              <>
                <circle cx="176" cy={dims.botY + 15} r="4.6" fill="#1e293b" strokeWidth="1" />
                <circle cx="176" cy={dims.botY + 15} r="1.7" fill="#cbd5e1" stroke="none" />
              </>
            )}
          </g>
        )}

        {/* Main Aircraft Fuselage */}
        <path
          d={
            isAirbus
              ? `M ${dims.tailX} ${midY - 2}
                 L ${dims.tailX + 34} ${dims.topY}
                 L ${dims.noseX - 36} ${dims.topY}
                 C ${dims.noseX - 10} ${dims.topY}, ${dims.noseX + 4} ${midY - 2}, ${dims.noseX + 4} ${midY + 3}
                 C ${dims.noseX + 4} ${dims.botY - 2}, ${dims.noseX - 10} ${dims.botY}, ${dims.noseX - 30} ${dims.botY}
                 L ${dims.tailX + 42} ${dims.botY}
                 L ${dims.tailX - 4} ${midY + 3} Z`
              : `M ${dims.tailX} ${midY - 2}
                 L ${dims.tailX + 34} ${dims.topY}
                 L ${dims.noseX - 38} ${dims.topY}
                 C ${dims.noseX - 18} ${dims.topY + 1}, ${dims.noseX - 4} ${midY - 1}, ${dims.noseX + 6} ${midY + 4}
                 C ${dims.noseX + 1} ${dims.botY - 1}, ${dims.noseX - 12} ${dims.botY}, ${dims.noseX - 32} ${dims.botY}
                 L ${dims.tailX + 42} ${dims.botY}
                 L ${dims.tailX - 4} ${midY + 3} Z`
          }
          fill={`url(#${gradId})`}
          stroke={isLight ? "rgba(30, 41, 59, 0.28)" : "rgba(226, 232, 240, 0.25)"}
          strokeWidth="0.9"
        />

        {/* Lower Livery Cheatline */}
        <path
          d={`M ${dims.tailX + 32} ${dims.botY - 5.5} L ${dims.noseX - 24} ${dims.botY - 5.5} L ${dims.noseX - 26} ${dims.botY - 3.6} L ${dims.tailX + 30} ${dims.botY - 3.6} Z`}
          fill={livery.cheatline}
          opacity="0.88"
        />

        {/* Cockpit Windshield Glazing */}
        <path
          d={`M ${dims.noseX - 28} ${dims.topY + 5} L ${dims.noseX - 12} ${dims.topY + 6.5} L ${dims.noseX - 9} ${dims.topY + 10.5} L ${dims.noseX - 28} ${dims.topY + 10.5} Z`}
          fill="#0f172a"
          stroke="#475569"
          strokeWidth="0.5"
        />
        <line
          x1={dims.noseX - 21}
          y1={dims.topY + 5.5}
          x2={dims.noseX - 21}
          y2={dims.topY + 10.5}
          stroke={livery.fuselage}
          strokeWidth="0.8"
        />

        {/* Cabin Doors & Windows */}
        {!isCargo ? (
          <>
            <rect
              x={dims.noseX - 42}
              y={dims.topY + 5}
              width="4.5"
              height="10.5"
              rx="1.2"
              fill="none"
              stroke={livery.fuselage === "#1d4ed8" ? "#93c5fd" : "#94a3b8"}
              strokeWidth="0.7"
            />
            <rect
              x={dims.tailX + 42}
              y={dims.topY + 5}
              width="4"
              height="10"
              rx="1.2"
              fill="none"
              stroke={livery.fuselage === "#1d4ed8" ? "#93c5fd" : "#94a3b8"}
              strokeWidth="0.7"
            />
            {windowXs.map((wx) => (
              <rect
                key={wx}
                x={wx}
                y={dims.topY + 7.2}
                width="3.2"
                height="4"
                rx="1"
                fill={livery.fuselage === "#1d4ed8" ? "#e0f2fe" : "#1e293b"}
                opacity="0.85"
              />
            ))}
          </>
        ) : (
          /* Forward Main-Deck Freighter Cargo Door */
          <rect
            x={dims.noseX - 88}
            y={dims.topY + 2}
            width="24"
            height="14"
            rx="1"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="0.8"
            strokeDasharray="2 1"
          />
        )}

        {/* Billboard Airline Title & FAA Tail Registration */}
        <text
          x={dims.noseX - 118}
          y={dims.topY + (isCargo ? 13 : 5.1)}
          fontSize={isCargo ? "11" : "5.4"}
          fontWeight="800"
          fontFamily="'Inter', system-ui, sans-serif"
          fill={livery.textColor}
          letterSpacing="0.5"
        >
          {livery.title}
        </text>
        <text
          x={dims.tailX + 52}
          y={dims.botY - 7.5}
          fontSize="5.8"
          fontWeight="700"
          fontFamily="'JetBrains Mono', monospace"
          fill={livery.fuselage === "#1d4ed8" ? "#e2e8f0" : "#475569"}
        >
          {registration}
        </text>

        {/* Wing Root Fairing & Swept Wing + Winglet */}
        <path
          d={`M 148 ${dims.botY - 3} L 204 ${dims.botY - 3} L 194 ${dims.botY + 5} L 122 ${dims.botY + 5} Z`}
          fill={isLight ? "#cbd5e1" : "#64748b"}
          stroke={isLight ? "#64748b" : "#94a3b8"}
          strokeWidth="0.6"
        />
        <path
          d={`M 155 ${dims.botY + 1} L 112 ${dims.botY + 5.5} L 106 ${dims.botY - 2.5} L 111 ${dims.botY - 2.5} L 117 ${dims.botY + 3} L 180 ${dims.botY + 1} Z`}
          fill={livery.tailAccent}
          stroke={isLight ? "#475569" : "#cbd5e1"}
          strokeWidth="0.5"
        />

        {/* High-Bypass Underwing Turbofan Nacelle */}
        <g>
          <rect
            x="170"
            y={dims.botY + 0.5}
            width={isWide ? "30" : "25"}
            height={isWide ? "12.5" : "10.5"}
            rx="4.2"
            fill={livery.nacelle}
            stroke={isLight ? "#334155" : "#94a3b8"}
            strokeWidth="0.7"
          />
          {/* Intake Chrome Rim */}
          <rect
            x={isWide ? "197" : "192"}
            y={dims.botY + 0.7}
            width="4.5"
            height={isWide ? "12.1" : "10.1"}
            rx="2"
            fill="#cbd5e1"
          />
          {/* Exhaust Cone */}
          <path
            d={`M 170 ${dims.botY + 2} L 164 ${dims.botY + 3.5} L 164 ${dims.botY + (isWide ? 11 : 9.5)} L 170 ${dims.botY + (isWide ? 12.5 : 10.5)} Z`}
            fill="#475569"
          />
        </g>

        {/* Horizontal Tailplane */}
        <path
          d={`M ${dims.tailX + 20} ${midY + 1} L ${dims.tailX - 10} ${midY - 4} L ${dims.tailX - 6} ${midY - 6} L ${dims.tailX + 34} ${midY - 1} Z`}
          fill={isLight ? "#cbd5e1" : "#64748b"}
          stroke={isLight ? "#475569" : "#94a3b8"}
          strokeWidth="0.6"
        />

        {/* Anti-Collision Beacon / Emergency Strobe */}
        <circle
          cx="188"
          cy={dims.topY}
          r={isEmergency ? "3.2" : "1.9"}
          fill={isEmergency ? "#ef4444" : "#f97316"}
          opacity="0.9"
        />
        <circle cx={dims.tailX - 10} cy={dims.tailTopY + 1} r="1.5" fill="#f8fafc" />
        </g>
      </svg>

      {/* Overlay Top-Left / Bottom Chips on Image Card */}
      <div className="absolute top-1.5 left-2 flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface)]/90 border border-[var(--atc-border)] text-[9px] font-mono font-bold text-[var(--atc-text)] shadow-sm">
          {spec.manufacturer.toUpperCase()} {spec.code}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface)]/90 border border-[var(--atc-border)] text-[9px] font-mono text-[var(--atc-muted)]">
          {registration}
        </span>
      </div>

      <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 rounded bg-[var(--atc-surface)]/90 border border-[var(--atc-border)] text-[9px] font-mono font-semibold text-[var(--atc-text-secondary)] shadow-sm">
          {agl}ft AGL • {pitchDeg > 0 ? `+${pitchDeg}` : pitchDeg}° • {Math.round(aircraft.verticalSpeed)} fpm
        </span>
      </div>

      <div className="absolute top-1.5 right-2">
        <span
          className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
            onGround
              ? "bg-[var(--atc-amber-bg)] border-[var(--atc-amber-border)] text-[var(--atc-amber)]"
              : "bg-[var(--atc-cyan-bg)] border-[var(--atc-cyan-border)] text-[var(--atc-cyan)]"
          }`}
        >
          {onGround ? "ON GROUND" : gearDown ? "GEAR DOWN" : "CRUISE / CLIMB"}
        </span>
      </div>
    </div>
  );
};
