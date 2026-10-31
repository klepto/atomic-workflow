import { z } from 'zod';
import { parseJson } from '../transcript/claude-entry.ts';

/**
 * One window of a usage limit.
 */
export interface UsageWindow {
  /**
   * Used percentage of the window, from 0 to 100, as the source gives it, not rounded.
   */
  readonly usedPercent: number;

  /**
   * Time when the window resets, in ms since the epoch.
   */
  readonly resetsAt: number;
}

/**
 * Result of `usageGet`.
 */
export interface UsageLimits {
  /**
   * The 5-hour window, or null when the source has none.
   */
  readonly fiveHour: UsageWindow | null;

  /**
   * The weekly window, or null when the source has none.
   */
  readonly sevenDay: UsageWindow | null;

  /**
   * Time when Claude Code fetched the values, in ms since the epoch, or null when the source has none.
   */
  readonly fetchedAt: number | null;
}

/**
 * Usage limits while the source has none.
 */
export const NO_USAGE_LIMITS: UsageLimits = { fiveHour: null, sevenDay: null, fetchedAt: null };

/**
 * Schema of a window of `cachedUsageUtilization.utilization`, with the fields that are read. The format is internal
 * to Claude Code, so every other field is ignored.
 */
const WINDOW = z.object({
  utilization: z.number().finite(),
  resets_at: z.iso.datetime({ offset: true }),
});

/**
 * Schema of `cachedUsageUtilization` in the global config file of Claude Code, with the fields that are read. Each
 * field falls back to `null` on its own, so a field that changes its shape drops only its own value.
 */
const CACHE = z.object({
  fetchedAtMs: z.number().finite().nullable().catch(null),
  utilization: z
    .object({
      five_hour: WINDOW.nullable().catch(null),
      seven_day: WINDOW.nullable().catch(null),
    })
    .nullable()
    .catch(null),
});

/**
 * Schema of the global config file of Claude Code, with the one field that is read.
 */
const CONFIG = z.object({ cachedUsageUtilization: CACHE });

/**
 * Returns the usage limits that the text `text` of the global config file of Claude Code holds. A text that is not
 * JSON, or that holds no valid `cachedUsageUtilization`, gives `NO_USAGE_LIMITS`. It never throws.
 */
export const parseUsageLimits = (text: string): UsageLimits => {
  const config = CONFIG.safeParse(parseJson(text));
  if (!config.success) return NO_USAGE_LIMITS;
  const { fetchedAtMs, utilization } = config.data.cachedUsageUtilization;
  return {
    fiveHour: windowOf(utilization?.five_hour ?? null),
    sevenDay: windowOf(utilization?.seven_day ?? null),
    fetchedAt: fetchedAtMs,
  };
};

/**
 * Returns the usage window of the parsed window `window`, with its percentage clamped into 0 to 100, or `null` for
 * `null`.
 */
const windowOf = (window: z.output<typeof WINDOW> | null): UsageWindow | null =>
  window === null
    ? null
    : { usedPercent: Math.min(100, Math.max(0, window.utilization)), resetsAt: Date.parse(window.resets_at) };

/**
 * Returns whether `a` and `b` hold the same usage limits.
 */
export const sameUsageLimits = (a: UsageLimits, b: UsageLimits): boolean =>
  a.fetchedAt === b.fetchedAt && sameWindow(a.fiveHour, b.fiveHour) && sameWindow(a.sevenDay, b.sevenDay);

/**
 * Returns whether `a` and `b` are the same usage window, or both `null`.
 */
const sameWindow = (a: UsageWindow | null, b: UsageWindow | null): boolean =>
  a === null || b === null ? a === b : a.usedPercent === b.usedPercent && a.resetsAt === b.resetsAt;
