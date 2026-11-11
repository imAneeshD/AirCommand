import React, { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { formatUserDateTime } from "../utils/dateTime.ts";

interface LocalClockBadgeProps {
  simTimeSec?: number;
  compact?: boolean;
}

function formatSimElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `T+${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const LocalClockBadge: React.FC<LocalClockBadgeProps> = ({
  simTimeSec,
  compact = false,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const dt = formatUserDateTime(now);

  return (
    <div
      title={`Local System Time (${dt.timeZone}): ${dt.fullText}`}
      className="shrink-0 px-2 py-1 rounded-md bg-[var(--atc-surface)] border border-[var(--atc-border)] font-mono text-[11px] text-[var(--atc-text)] shadow-sm flex items-center gap-1.5 whitespace-nowrap tabular-nums"
    >
      <span className={`${compact ? "hidden lg:inline-flex" : "hidden sm:inline-flex"} items-center gap-1 text-[10px] text-[var(--atc-muted)]`}>
        <Calendar className="w-3 h-3 text-[var(--atc-cyan)] shrink-0" />
        <span>{dt.shortDateText}</span>
      </span>
      <span className={`${compact ? "hidden lg:inline" : "hidden sm:inline"} text-[var(--atc-border-strong)]`}>•</span>
      <span className="inline-flex items-center gap-1 font-bold">
        <Clock className="w-3 h-3 text-[var(--atc-accent-text)] shrink-0 sm:hidden" />
        <span>{dt.timeText}</span>
      </span>
      {simTimeSec !== undefined && (
        <>
          <span className="text-[var(--atc-border-strong)]">|</span>
          <span
            className="text-[10px] font-semibold text-[var(--atc-muted)]"
            title="Simulation elapsed clock"
          >
            {formatSimElapsed(simTimeSec)}
          </span>
        </>
      )}
    </div>
  );
};
