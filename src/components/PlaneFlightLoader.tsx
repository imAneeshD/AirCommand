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
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(34,211,238,0.08)_0%,_transparent_70%)]" />

      {/* Main Plane in Air Canvas Scene */}
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
 * Animated Sky Scene with clouds, contrails, wind streaks, and a cruising airliner.
 */
function PlaneSkyScene({ compact = false }: { compact?: boolean }) {
  const width = compact ? 280 : 540;
  const height = compact ? 100 : 220;

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
      {/* Inline styles for custom keyframe animations */}
      <style>{`
        @keyframes planeCruise {
          0% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-7px) rotate(-1.5deg); }
          50% { transform: translateY(-2px) rotate(0.5deg); }
          75% { transform: translateY(6px) rotate(1.2deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }

        @keyframes cloudDriftSlow {
          0% { transform: translateX(110%); }
          100% { transform: translateX(-120%); }
        }

        @keyframes cloudDriftMed {
          0% { transform: translateX(110%); }
          100% { transform: translateX(-130%); }
        }

        @keyframes cloudDriftFast {
          0% { transform: translateX(110%); }
          100% { transform: translateX(-140%); }
        }

        @keyframes windStreak {
          0% { transform: translateX(120%); opacity: 0; }
          20% { opacity: 0.7; }
          80% { opacity: 0.7; }
          100% { transform: translateX(-120%); opacity: 0; }
        }

        @keyframes jetExhaust {
          0%, 100% { opacity: 0.55; transform: scaleX(0.9); }
          50% { opacity: 0.95; transform: scaleX(1.15); }
        }

        @keyframes beaconBlink {
          0%, 85%, 100% { opacity: 0.15; }
          90% { opacity: 1; }
        }

        @keyframes radarSweep {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      {/* Atmospheric Horizon Haze */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-950/20 via-blue-950/10 to-transparent pointer-events-none" />

      {/* Faint Grid / Radar Altitude Lines */}
      <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#38bdf8_1px,transparent_1px),linear-gradient(to_bottom,#38bdf8_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Background Distant Cloud Layer 1 (Slow) */}
      <div
        className="absolute w-36 h-12 text-slate-400/15 pointer-events-none"
        style={{
          top: "15%",
          animation: "cloudDriftSlow 20s linear infinite",
          animationDelay: "-3s",
        }}
      >
        <CloudSvg />
      </div>

      <div
        className="absolute w-44 h-14 text-slate-400/15 pointer-events-none"
        style={{
          top: "60%",
          animation: "cloudDriftSlow 24s linear infinite",
          animationDelay: "-14s",
        }}
      >
        <CloudSvg />
      </div>

      {/* Mid-level Cloud Layer 2 (Medium Speed) */}
      <div
        className="absolute w-40 h-14 text-slate-300/25 pointer-events-none"
        style={{
          top: "28%",
          animation: "cloudDriftMed 14s linear infinite",
          animationDelay: "-7s",
        }}
      >
        <CloudSvg />
      </div>

      <div
        className="absolute w-48 h-16 text-slate-300/20 pointer-events-none"
        style={{
          top: "68%",
          animation: "cloudDriftMed 16s linear infinite",
          animationDelay: "-1s",
        }}
      >
        <CloudSvg />
      </div>

      {/* High-Speed Wind / Slipstream Streaks */}
      <div
        className="absolute w-32 h-[1px] bg-gradient-to-l from-transparent via-cyan-400/40 to-transparent pointer-events-none"
        style={{
          top: "24%",
          animation: "windStreak 2.2s linear infinite",
          animationDelay: "0.2s",
        }}
      />
      <div
        className="absolute w-48 h-[1.5px] bg-gradient-to-l from-transparent via-cyan-300/50 to-transparent pointer-events-none"
        style={{
          top: "42%",
          animation: "windStreak 1.7s linear infinite",
          animationDelay: "0.9s",
        }}
      />
      <div
        className="absolute w-40 h-[1px] bg-gradient-to-l from-transparent via-cyan-400/40 to-transparent pointer-events-none"
        style={{
          top: "76%",
          animation: "windStreak 2.5s linear infinite",
          animationDelay: "1.4s",
        }}
      />

      {/* Cruising Airliner Component */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          animation: "planeCruise 5s ease-in-out infinite",
        }}
      >
        <AirlinerFlightSvg compact={compact} />
      </div>

      {/* Foreground Cloud Layer 3 (Faster, Passing Close Below) */}
      <div
        className="absolute w-56 h-18 text-cyan-200/25 pointer-events-none z-20"
        style={{
          top: "72%",
          animation: "cloudDriftFast 9s linear infinite",
          animationDelay: "-4s",
        }}
      >
        <CloudSvg />
      </div>
    </div>
  );
}

/**
 * Detailed SVG vector graphic of a modern commercial airliner in flight with contrails, engines, and strobe lights.
 */
function AirlinerFlightSvg({ compact }: { compact?: boolean }) {
  const scale = compact ? 0.62 : 1;
  const w = 320 * scale;
  const h = 110 * scale;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 320 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-[0_8px_20px_rgba(34,211,238,0.25)] select-none"
    >
      <defs>
        {/* Fuselage metallic lighting gradient */}
        <linearGradient id="fuselageGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#e2e8f0" />
          <stop offset="70%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>

        {/* Wing gradient */}
        <linearGradient id="wingGrad" x1="0%" y1="0%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="60%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>

        {/* Engine nacelle gradient */}
        <linearGradient id="engineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="40%" stopColor="#475569" />
          <stop offset="85%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* Jet engine thrust glow */}
        <linearGradient id="jetThrustGrad" x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </linearGradient>

        {/* Contrail vapor stream */}
        <linearGradient id="contrailGrad" x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#bae6fd" stopOpacity="0.4" />
          <stop offset="85%" stopColor="#7dd3fc" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>

        {/* Cockpit windshield glass sheen */}
        <linearGradient id="cockpitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="60%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#082f49" />
        </linearGradient>
      </defs>

      {/* Upper Contrail from Wingtip */}
      <path
        d="M 50 38 L -30 36 C -50 36 -70 34 -90 33 L -90 41 C -70 41 -50 40 -30 40 Z"
        fill="url(#contrailGrad)"
        className="opacity-75"
      />

      {/* Engine Exhaust Contrail Stream */}
      <path
        d="M 120 70 L -20 67 C -60 67 -80 64 -110 63 L -110 74 C -80 74 -60 72 -20 72 Z"
        fill="url(#contrailGrad)"
        className="opacity-85"
      />

      {/* Jet Engine Cyan Thrust Cone */}
      <ellipse
        cx="116"
        cy="70"
        rx="16"
        ry="4.5"
        fill="url(#jetThrustGrad)"
        style={{
          transformOrigin: "120px 70px",
          animation: "jetExhaust 0.8s ease-in-out infinite",
        }}
      />

      {/* Horizontal Stabilizer (Tail Plane) */}
      <polygon
        points="52,42 22,46 16,51 46,47"
        fill="#94a3b8"
        stroke="#475569"
        strokeWidth="1"
      />

      {/* Vertical Stabilizer (Tail Fin) */}
      <polygon
        points="70,44 32,8 46,8 86,43"
        fill="url(#wingGrad)"
        stroke="#334155"
        strokeWidth="1.2"
      />
      {/* Airline Fin Accent Stripe */}
      <polygon
        points="52,14 42,9 47,8 60,14"
        fill="#0284c7"
      />

      {/* Tail Fin White Strobe Beacon */}
      <circle
        cx="39"
        cy="8"
        r="2.5"
        fill="#ffffff"
        style={{ animation: "beaconBlink 1.1s infinite" }}
      />

      {/* Main Fuselage Body */}
      <path
        d="
          M 46 48
          C 40 48 35 50 30 52
          C 25 54 20 56 18 57
          C 22 58 35 59 52 59
          L 230 59
          C 258 59 284 56 295 52
          C 285 47 252 45 220 45
          L 66 45
          Z
        "
        fill="url(#fuselageGrad)"
        stroke="#334155"
        strokeWidth="1.2"
      />

      {/* Nose Aerodynamic Radome Tip */}
      <path
        d="M 285 50 C 293 51 297 52 297 52 C 297 52 293 54 285 55 Z"
        fill="#64748b"
      />

      {/* Cockpit Windshield Visor */}
      <polygon
        points="268,47 280,49 278,52 266,51"
        fill="url(#cockpitGrad)"
        stroke="#0c4a6e"
        strokeWidth="0.8"
      />

      {/* Passenger Cabin Window Row */}
      {Array.from({ length: 18 }).map((_, i) => {
        const x = 75 + i * 9.5;
        // Skip over the wing box
        if (x >= 148 && x <= 162) return null;
        return (
          <rect
            key={i}
            x={x}
            y={49}
            width="4.5"
            height="3.2"
            rx="1.4"
            fill="#0284c7"
            className="opacity-90"
          />
        );
      })}

      {/* Main Swept Wing */}
      <polygon
        points="136,54 186,54 150,88 126,88"
        fill="url(#wingGrad)"
        stroke="#334155"
        strokeWidth="1.2"
      />

      {/* Upward Cant Winglet */}
      <polygon
        points="126,88 122,80 125,78 129,86"
        fill="#0284c7"
      />

      {/* Port Navigation Light (Red Strobe at Winglet) */}
      <circle
        cx="123"
        cy="79"
        r="2"
        fill="#ef4444"
        style={{ animation: "beaconBlink 0.9s infinite" }}
      />

      {/* Turbofan Jet Engine Pod */}
      <rect
        x="126"
        y="64"
        width="34"
        height="12"
        rx="5.5"
        fill="url(#engineGrad)"
        stroke="#1e293b"
        strokeWidth="1.2"
      />
      {/* Engine Intake Cowling Rim */}
      <ellipse
        cx="158"
        cy="70"
        rx="3.5"
        ry="5.5"
        fill="#0f172a"
        stroke="#64748b"
        strokeWidth="1"
      />
      {/* Engine Fan Spinner Hub */}
      <circle
        cx="158"
        cy="70"
        r="1.8"
        fill="#38bdf8"
      />

      {/* Fuselage Belly Red Flashing Beacon */}
      <circle
        cx="160"
        cy="60"
        r="2.2"
        fill="#ef4444"
        style={{ animation: "beaconBlink 1.4s infinite" }}
      />
    </svg>
  );
}

/**
 * Reusable Stylized Cloud SVG
 */
function CloudSvg() {
  return (
    <svg
      viewBox="0 0 120 48"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full filter blur-[1px]"
    >
      <path d="M 20 40 C 12 40 6 34 6 26 C 6 18 13 13 21 14 C 26 6 37 2 48 5 C 57 -1 69 0 76 6 C 84 4 93 8 96 16 C 105 16 112 23 112 30 C 112 37 106 42 98 42 L 20 42 Z" />
    </svg>
  );
}

export default PlaneFlightLoader;
