import type { UsageLimits, UsageWindow } from '@/api/types.ts';
import { formatLongDuration } from '@/time/duration-format.ts';
import { formatFullTime } from '@/time/time-format.ts';
import { useNow } from '@/time/use-now.ts';

/**
 * Text in place of the percentage of a window whose usage is unknown.
 */
const UNKNOWN = '—';

/**
 * Props of `UsageRow`.
 */
interface UsageRowProps {
  /**
   * Name of the window, such as `5-hour`.
   */
  readonly label: string;

  /**
   * Window that the row shows, or `null` while its usage is unknown.
   */
  readonly usageWindow: UsageWindow | null;

  /**
   * Current time, in ms since the epoch.
   */
  readonly now: number;
}

/**
 * Props of `UsageMeter`.
 */
interface UsageMeterProps {
  /**
   * Usage limits as the latest `usageGet` answered them, or `undefined` until it answered, and while it fails.
   */
  readonly usage: UsageLimits | undefined;
}

/**
 * Returns the hint of the meter: when Claude Code fetched the usage limits `usage`, or why that is not known.
 */
const hintOf = (usage: UsageLimits | undefined): string => {
  if (usage === undefined) return 'Usage limits not known: the server has not answered';
  if (usage.fetchedAt === null) return 'Usage limits not known: Claude Code has not fetched them';
  return `Usage limits fetched by Claude Code on ${formatFullTime(usage.fetchedAt)}`;
};

/**
 * Row of one window of the usage limits: its label `label` and its used percentage, rounded to a whole number, above a
 * bar of that length, then the time until the window resets. A window `usageWindow` that is `null`, or whose reset time
 * has passed at `now`, shows `—` and an empty bar, since its usage is unknown, not 0%.
 */
const UsageRow = ({ label, usageWindow, now }: UsageRowProps) => {
  const known = usageWindow !== null && usageWindow.resetsAt > now;
  const percent = known ? Math.round(usageWindow.usedPercent) : 0;
  return (
    <div className="flex min-w-32 flex-col gap-1 whitespace-nowrap text-xs leading-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sidebar-foreground">{label}</span>
        <span className="text-sidebar-foreground tabular-nums">{known ? `${percent}%` : UNKNOWN}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-sidebar-border">
        <div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${percent}%` }} />
      </div>
      {known && (
        <span className="text-muted-foreground tabular-nums">
          resets in {formatLongDuration(usageWindow.resetsAt - now)}
        </span>
      )}
    </div>
  );
};

/**
 * Meter of the usage limits of the Claude subscription `usage`, at the bottom of the sidebar: the rows `5-hour` and
 * `Weekly`, each with its used percentage, a bar and the time until it resets. Both rows show `—` while `usage` is
 * `undefined`. Its hint, on hover, says when Claude Code fetched the values. It renders again once per second, so the
 * time until each reset counts down, and a window turns to `—` once its reset time passed, without a new read.
 */
export const UsageMeter = ({ usage }: UsageMeterProps) => {
  const now = useNow(true);
  return (
    <section
      aria-label="Usage limits"
      title={hintOf(usage)}
      className="flex shrink-0 items-center gap-3 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:px-3"
    >
      <UsageRow label="5-hour" usageWindow={usage?.fiveHour ?? null} now={now} />
      <UsageRow label="Weekly" usageWindow={usage?.sevenDay ?? null} now={now} />
    </section>
  );
};
