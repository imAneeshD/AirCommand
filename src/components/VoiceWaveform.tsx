import React from "react";

export interface VoiceWaveformProps {
  /** Whether the voice transmission is actively speaking / animating */
  isSpeaking?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "xs";
  /** Optional custom color class, defaults to currentColor */
  className?: string;
  /** Title / tooltip */
  title?: string;
}

// 15 bars shaped with realistic voice frequency amplitude profile (matching speech audio waveform)
const BAR_PROFILES = [
  { id: 0, x: 2,  baseH: 3,  dur: "0.55s", delay: "-0.20s" },
  { id: 1, x: 6,  baseH: 5,  dur: "0.45s", delay: "-0.40s" },
  { id: 2, x: 10, baseH: 9,  dur: "0.60s", delay: "-0.15s" },
  { id: 3, x: 14, baseH: 13, dur: "0.50s", delay: "-0.30s" },
  { id: 4, x: 18, baseH: 15, dur: "0.65s", delay: "-0.05s" },
  { id: 5, x: 22, baseH: 11, dur: "0.48s", delay: "-0.25s" },
  { id: 6, x: 26, baseH: 6,  dur: "0.58s", delay: "-0.45s" },
  { id: 7, x: 30, baseH: 4,  dur: "0.42s", delay: "-0.10s" },
  { id: 8, x: 34, baseH: 8,  dur: "0.52s", delay: "-0.35s" },
  { id: 9, x: 38, baseH: 14, dur: "0.62s", delay: "-0.18s" },
  { id: 10, x: 42, baseH: 15, dur: "0.46s", delay: "-0.50s" },
  { id: 11, x: 46, baseH: 10, dur: "0.54s", delay: "-0.22s" },
  { id: 12, x: 50, baseH: 7,  dur: "0.44s", delay: "-0.38s" },
  { id: 13, x: 54, baseH: 4,  dur: "0.56s", delay: "-0.12s" },
  { id: 14, x: 58, baseH: 3,  dur: "0.40s", delay: "-0.28s" },
];

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  isSpeaking = true,
  size = "sm",
  className = "",
  title = "Pilot radio voice transmission active",
}) => {
  // Dimensions
  const dims = {
    xs: { w: 38, h: 10, viewBox: "0 0 60 16" },
    sm: { w: 46, h: 12, viewBox: "0 0 60 16" },
    md: { w: 58, h: 14, viewBox: "0 0 60 16" },
  }[size];

  return (
    <span
      className={`inline-flex items-center shrink-0 ${className}`}
      title={title}
      style={{ verticalAlign: "middle" }}
    >
      <svg
        width={dims.w}
        height={dims.h}
        viewBox={dims.viewBox}
        className="overflow-visible select-none inline-block"
        aria-hidden="true"
      >
        <title>{title}</title>
        <g fill="currentColor">
          {BAR_PROFILES.map((bar) => {
            const y = (16 - bar.baseH) / 2;
            return (
              <rect
                key={bar.id}
                x={bar.x}
                y={y}
                width={2.2}
                height={bar.baseH}
                rx={1.1}
                style={
                  isSpeaking
                    ? {
                        transformOrigin: `${bar.x + 1.1}px 8px`,
                        animation: `voiceBarPulse ${bar.dur} ease-in-out infinite alternate`,
                        animationDelay: bar.delay,
                      }
                    : {
                        opacity: 0.35,
                        transform: "scaleY(0.4)",
                        transformOrigin: `${bar.x + 1.1}px 8px`,
                        transition: "transform 0.25s ease, opacity 0.25s ease",
                      }
                }
              />
            );
          })}
        </g>
      </svg>
    </span>
  );
};
