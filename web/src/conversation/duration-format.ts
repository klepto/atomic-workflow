/**
 * The length of a second in milliseconds.
 */
const SECOND = 1000;

/**
 * The length of a minute in milliseconds.
 */
const MINUTE = 60 * SECOND;

/**
 * The length of an hour in milliseconds.
 */
const HOUR = 60 * MINUTE;

/**
 * Returns the span `milliseconds` in short, each unit a whole count rounded down: the seconds alone under a minute,
 * such as `45s`, the minutes and the seconds under an hour, such as `1m 56s`, and the hours and the minutes from an
 * hour on, such as `1h 2m`. A span below 0 is `0s`.
 */
export const formatDuration = (milliseconds: number): string => {
  const span = Math.max(0, milliseconds);
  const hours = Math.floor(span / HOUR);
  const minutes = Math.floor((span % HOUR) / MINUTE);
  const seconds = Math.floor((span % MINUTE) / SECOND);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};
