import React from "react";

export interface PlaneFlightLoaderProps {
  message?: string;
  submessage?: string;
  compact?: boolean;
  fullscreen?: boolean;
  className?: string;
}

export const PlaneFlightLoader: React.FC<PlaneFlightLoaderProps> = ({
  message = "Loading Airspace Data...",
  submessage = "TRANSITING CRUISE FLIGHT LEVEL · RADAR SYNCHRONIZING",
  compact = false,
  fullscreen = !compact,
  className = "",
}) => {
  if (compact) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] p-4 flex flex-col items-center justify-center select-none ${className}`}
      >
        <PlaneSkyScene compact={true} />
        <div className="mt-3 text-center">
          <div className="text-xs font-mono font-bold text-[var(--atc-cyan)] tracking-wider flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--atc-cyan)] animate-ping" />
            {message}
          </div>
          {submessage && (
            <div className="text-[10px] font-mono text-[var(--atc-muted)] mt-0.5 tracking-tight">
              {submessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  const containerClasses = fullscreen
    ? "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#050b14]/90 backdrop-blur-md transition-all duration-300 animate-in fade-in select-none"
    : `relative w-full h-full min-h-[340px] flex flex-col items-center justify-center bg-[#050b14]/80 backdrop-blur-sm transition-all duration-300 select-none ${className}`;

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(56,189,248,0.10)_0%,_transparent_70%)]" />

      {/* Main Doodle Plane Flight Canvas Scene */}
      <div className="relative w-full max-w-[560px] h-[220px] sm:h-[260px] flex items-center justify-center overflow-hidden rounded-2xl border border-[var(--atc-border-strong)]/40 bg-gradient-to-b from-[#061122] via-[#08152c] to-[#040914] shadow-2xl">
        <PlaneSkyScene />
      </div>

      {/* ATC Flight Information HUD Deck */}
      <div className="mt-6 flex flex-col items-center text-center px-4 max-w-md w-full">
        {/* Status Callout Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--atc-cyan-border)] bg-[var(--atc-cyan-bg)] text-[11px] font-mono font-bold text-[var(--atc-cyan)] shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--atc-cyan)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--atc-cyan)]" />
          </span>
          <span>AIR TRAFFIC CONTROL RADAR LINK</span>
        </div>

        {/* Primary Message */}
        <h2 className="mt-2.5 text-base sm:text-lg font-mono font-extrabold text-[var(--atc-text)] tracking-wide">
          {message}
        </h2>

        {/* Secondary Subtitle / Flight Telemetry */}
        {submessage && (
          <p className="mt-1 text-xs font-mono text-[var(--atc-muted)] uppercase tracking-wider">
            {submessage}
          </p>
        )}

        {/* Animated Radar Progress Bar */}
        <div className="mt-4 w-56 sm:w-64 h-1.5 rounded-full bg-slate-800/80 overflow-hidden relative border border-slate-700/50">
          <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-transparent via-[var(--atc-cyan)] to-emerald-400 w-1/2 rounded-full animate-[radarSweep_1.8s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
};

/**
 * Animated Sky Scene featuring the hand-drawn doodle airplane GIF flight loop,
 * floating clouds, slipstream streaks, and radar grid.
 */
function PlaneSkyScene({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
      {/* Custom keyframe animations for the doodle GIF feel */}
      <style>{`
        @keyframes doodleFly {
          0% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-7px) rotate(-1.8deg); }
          50% { transform: translateY(-2px) rotate(0.4deg); }
          75% { transform: translateY(6px) rotate(1.4deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }

        @keyframes doodleCloudPuff {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.05) translateY(-2px); }
        }

        @keyframes doodleTrailStream {
          0% { transform: translateX(0); opacity: 0.85; }
          50% { transform: translateX(-16px); opacity: 0.45; }
          100% { transform: translateX(-32px); opacity: 0; }
        }

        @keyframes doodleWindSpeed {
          0% { transform: translateX(200px); opacity: 0; }
          15% { opacity: 0.8; }
          85% { opacity: 0.8; }
          100% { transform: translateX(-240px); opacity: 0; }
        }

        @keyframes doodleCloudDriftSlow {
          0% { transform: translateX(240px); }
          100% { transform: translateX(-260px); }
        }

        @keyframes doodleCloudDriftFast {
          0% { transform: translateX(240px); }
          100% { transform: translateX(-260px); }
        }

        @keyframes radarSweep {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      {/* Radar Coordinate Grid */}
      <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#38bdf8_1px,transparent_1px),linear-gradient(to_bottom,#38bdf8_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Atmospheric Horizon Haze */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-950/20 via-blue-950/10 to-transparent pointer-events-none" />

      {/* Drifting Background Doodle Clouds */}
      <div
        className="absolute w-28 h-10 text-cyan-200/15 pointer-events-none"
        style={{
          top: "14%",
          animation: "doodleCloudDriftSlow 18s linear infinite",
          animationDelay: "-3s",
        }}
      >
        <DoodleBackgroundCloudSvg />
      </div>

      <div
        className="absolute w-36 h-12 text-slate-300/15 pointer-events-none"
        style={{
          top: "65%",
          animation: "doodleCloudDriftFast 13s linear infinite",
          animationDelay: "-8s",
        }}
      >
        <DoodleBackgroundCloudSvg />
      </div>

      {/* High-Speed Wind / Slipstream Streaks (Doodle Hand-drawn Dashes) */}
      <div
        className="absolute w-28 h-[2px] bg-gradient-to-l from-transparent via-cyan-400/50 to-transparent pointer-events-none"
        style={{
          top: "22%",
          animation: "doodleWindSpeed 2.2s linear infinite",
          animationDelay: "0.2s",
        }}
      />
      <div
        className="absolute w-40 h-[2.5px] bg-gradient-to-l from-transparent via-cyan-300/60 to-transparent pointer-events-none"
        style={{
          top: "38%",
          animation: "doodleWindSpeed 1.8s linear infinite",
          animationDelay: "0.9s",
        }}
      />
      <div
        className="absolute w-32 h-[2px] bg-gradient-to-l from-transparent via-sky-400/50 to-transparent pointer-events-none"
        style={{
          top: "78%",
          animation: "doodleWindSpeed 2.5s linear infinite",
          animationDelay: "1.4s",
        }}
      />

      {/* Cruising Doodle Airplane */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          animation: "doodleFly 4.5s ease-in-out infinite",
        }}
      >
        <DoodleAirplaneSvg compact={compact} />
      </div>
    </div>
  );
}

/**
 * Hand-drawn Doodle Airplane SVG recreated exactly from the user's reference doodle.
 * Features:
 * - Line art stroke: #305586 with round caps & joins
 * - Fuselage: Crisp #ffffff body with #c7edf6 underbelly shading
 * - Top Far Wing & Bottom Near Wing matching user doodle contours
 * - Slanted cockpit visor + 3 passenger cabin windows (#249ad0 cyan)
 * - Trailing contrail dashes behind tail
 * - Doodle cloud puffs underneath with animated breathing pulse
 */
export function DoodleAirplaneSvg({ compact = false }: { compact?: boolean }) {
  const scale = compact ? 0.6 : 1;
  const w = 340 * scale;
  const h = 190 * scale;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 340 190"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] select-none"
    >
      <defs>
        {/* Soft shadow / glow filter */}
        <filter id="doodleGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0284c7" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Speed Contrail Dashes Trailing Behind Tail */}
      <g>
        {/* Main Contrail Dash matching doodle */}
        <line
          x1="16"
          y1="52"
          x2="54"
          y2="52"
          stroke="#305586"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {/* Animated Stream Dash behind */}
        <line
          x1="-14"
          y1="52"
          x2="6"
          y2="52"
          stroke="#38bdf8"
          strokeWidth="3.2"
          strokeLinecap="round"
          style={{ animation: "doodleTrailStream 1.5s ease-out infinite" }}
        />
      </g>

      {/* Far Wing (Top Wing - behind fuselage) */}
      <path
        d="M 172 63 C 170 38 174 24 186 24 C 196 24 218 52 232 63 Z"
        fill="#ffffff"
        stroke="#305586"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Far Wing Soft Sky-Cyan Shading */}
      <path
        d="M 174 58 C 173 40 176 28 185 27 C 190 27 202 44 215 58 Z"
        fill="#c7edf6"
      />

      {/* Main Fuselage Outline & Body */}
      <path
        d="
          M 76 68
          C 73 42 70 20 80 18
          C 90 16 97 45 110 65
          C 142 63 192 61 245 66
          C 278 70 300 78 304 88
          C 306 97 292 108 266 112
          C 205 116 138 111 86 94
          C 74 88 74 76 76 68
          Z
        "
        fill="#ffffff"
        stroke="#305586"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Soft Underbelly Cyan Shading Contour */}
      <path
        d="
          M 77 74
          C 78 84 94 94 135 102
          C 190 110 252 110 295 93
          C 292 101 268 110 236 112
          C 176 114 116 109 84 93
          C 76 87 75 79 77 74
          Z
        "
        fill="#c7edf6"
      />

      {/* Cockpit Windshield Visor (Forward-slanted rounded rect) */}
      <path
        d="M 276 80 L 292 78 C 298 81 298 86 292 90 L 277 89 C 275 86 275 83 276 80 Z"
        fill="#ffffff"
        stroke="#305586"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 279 82 L 290 80 C 294 82 294 85 290 87 L 279 87 Z"
        fill="#249ad0"
      />

      {/* Passenger Cabin Windows (3 rounded dots with radar-blue center) */}
      <circle cx="236" cy="85" r="4" fill="#249ad0" stroke="#305586" strokeWidth="2.5" />
      <circle cx="250" cy="85" r="4" fill="#249ad0" stroke="#305586" strokeWidth="2.5" />
      <circle cx="264" cy="85" r="4" fill="#249ad0" stroke="#305586" strokeWidth="2.5" />

      {/* Near Wing (Bottom Wing - in front of fuselage) */}
      <path
        d="
          M 235 94
          C 225 110 198 146 182 158
          C 173 164 165 158 170 146
          C 182 120 200 96 208 88
          Z
        "
        fill="#ffffff"
        stroke="#305586"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Near Wing Soft Cyan Shading */}
      <path
        d="
          M 221 98
          C 212 114 192 144 180 154
          C 175 158 170 154 173 145
          C 182 124 196 102 204 95
          Z
        "
        fill="#c7edf6"
      />

      {/* Doodle Clouds Underneath the Airplane */}
      <g
        style={{
          transformOrigin: "200px 165px",
          animation: "doodleCloudPuff 3.8s ease-in-out infinite",
        }}
      >
        <path
          d="
            M 166 168
            C 173 154 191 154 200 163
            C 207 148 233 146 246 162
            C 251 166 256 168 261 168
          "
          fill="none"
          stroke="#305586"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Cloud Base Slipstream Dash */}
        <line
          x1="160"
          y1="170"
          x2="192"
          y2="170"
          stroke="#305586"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/**
 * Reusable Stylized Hand-Drawn Doodle Cloud SVG for background drift
 */
function DoodleBackgroundCloudSvg() {
  return (
    <svg
      viewBox="0 0 120 48"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full filter blur-[0.5px]"
    >
      <path
        d="M 20 40 C 12 40 6 34 6 26 C 6 18 13 13 21 14 C 26 6 37 2 48 5 C 57 -1 69 0 76 6 C 84 4 93 8 96 16 C 105 16 112 23 112 30 C 112 37 106 42 98 42 L 20 42 Z"
        opacity="0.5"
      />
    </svg>
  );
}

export default PlaneFlightLoader;
