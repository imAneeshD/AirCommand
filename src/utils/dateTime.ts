export interface FormattedUserDateTime {
  dateText: string;
  shortDateText: string;
  timeText: string;
  fullText: string;
  timeZone: string;
}

/**
 * Formats the user's current local date and wall-clock time using the system's
 * active locale & timezone, keeping tabular 24-hour HH:MM:SS precision.
 */
export function formatUserDateTime(date: Date = new Date()): FormattedUserDateTime {
  const shortDateText = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  const timeText = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";

  return {
    dateText,
    shortDateText,
    timeText,
    fullText: `${dateText} • ${timeText}`,
    timeZone,
  };
}

/**
 * Converts a simulation timestamp (seconds elapsed) into the corresponding
 * wall-clock time anchored at the user's real local clock.
 */
export function formatWallClockAtSimOffset(
  anchorWallMs: number,
  anchorSimSec: number,
  targetSimSec: number
): string {
  const wallMs = anchorWallMs + (targetSimSec - anchorSimSec) * 1000;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(wallMs));
}
