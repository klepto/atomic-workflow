/**
 * Length of a second, in ms.
 */
const SECOND = 1000;

/**
 * Length of a minute, in ms.
 */
const MINUTE = 60 * SECOND;

/**
 * Length of an hour, in ms.
 */
const HOUR = 60 * MINUTE;

/**
 * Span of time in whole hours, minutes and seconds, each rounded down.
 */
interface SpanParts {
  /**
   * Whole hours of the span.
   */
  readonly hours: number;

  /**
   * Whole minutes of the span after its hours, from 0 to 59.
   */
  readonly minutes: number;

  /**
   * Whole seconds of the span after its minutes, from 0 to 59.
   */
  readonly seconds: number;
}

/**
 * Returns the span `milliseconds` in whole hours, minutes and seconds, each rounded down. A span below 0 counts as 0.
 */
export const spanParts = (milliseconds: number): SpanParts => {
  const span = Math.max(0, milliseconds);
  return {
    hours: Math.floor(span / HOUR),
    minutes: Math.floor((span % HOUR) / MINUTE),
    seconds: Math.floor((span % MINUTE) / SECOND),
  };
};

/**
 * Returns the span `milliseconds` in short, each unit a whole count rounded down: the seconds alone under a minute,
 * such as `45s`, the minutes and the seconds under an hour, such as `1m 56s`, and the hours and the minutes from an
 * hour on, such as `1h 2m`. A span below 0 is `0s`.
 */
export const formatDuration = (milliseconds: number): string => {
  const { hours, minutes, seconds } = spanParts(milliseconds);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};
