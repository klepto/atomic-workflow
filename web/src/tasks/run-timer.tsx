import type { TaskSummary } from '@/api/types.ts';
import { cn } from '@/lib/utils.ts';
import { isRunActive } from '@/tasks/run-state.ts';
import { useNow } from '@/time/use-now.ts';

/**
 * Length of a second, in ms.
 */
const SECOND = 1000;

/**
 * Visible label of the timer, which names what it counts.
 */
const LABEL = 'Unattended run';

/**
 * Span in whole hours, minutes and seconds.
 */
interface SpanParts {
  /**
   * Whole hours of the span.
   */
  readonly hours: number;

  /**
   * Whole minutes of the span beyond its hours, from 0 to 59.
   */
  readonly minutes: number;

  /**
   * Whole seconds of the span beyond its minutes, from 0 to 59.
   */
  readonly seconds: number;
}

/**
 * Props of `RunTimer`.
 */
interface RunTimerProps {
  /**
   * Task whose latest unattended run the timer shows.
   */
  readonly task: TaskSummary;
}

/**
 * Returns the span `milliseconds` in whole hours, minutes and seconds, each rounded down. A span below 0 counts as 0.
 */
const partsOf = (milliseconds: number): SpanParts => {
  const seconds = Math.floor(Math.max(0, milliseconds) / SECOND);
  return { hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60 };
};

/**
 * Returns the span `milliseconds` as a clock: `m:ss` under an hour, such as `4:07`, and `h:mm:ss` from an hour on,
 * such as `1:02:33`.
 */
const formatClock = (milliseconds: number): string => {
  const { hours, minutes, seconds } = partsOf(milliseconds);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
};

/**
 * Returns the span `milliseconds` in words, with each unit that is not 0, such as `4 minutes 7 seconds` or
 * `1 hour 33 seconds`. A span under a second reads `0 seconds`.
 */
const formatSpokenDuration = (milliseconds: number): string => {
  const { hours, minutes, seconds } = partsOf(milliseconds);
  const words = [
    [hours, 'hour'],
    [minutes, 'minute'],
    [seconds, 'second'],
  ] as const;
  const spoken = words
    .filter(([count]) => count > 0)
    .map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`);
  return spoken.length > 0 ? spoken.join(' ') : '0 seconds';
};

/**
 * Duration of the latest unattended run of the task `task`, below the label `Unattended run`. While the run is active,
 * it counts up from `runStartedAt` once per second, in green. Once the run ended, it spans to `runEndedAt`, stays
 * still, and is muted. Its accessible text names the state and the duration in words, such as
 * `Unattended run, running for 4 minutes 7 seconds`. It renders nothing for a task that never ran. Only the timer
 * renders again each second, not the panel around it.
 */
export const RunTimer = ({ task }: RunTimerProps) => {
  const active = isRunActive(task);
  const now = useNow(active);
  if (task.runStartedAt === null) {
    return null;
  }
  const span = (task.runEndedAt ?? now) - task.runStartedAt;
  return (
    <p className="flex items-baseline gap-2 text-sm">
      <span aria-hidden="true" className="text-muted-foreground">
        {LABEL}
      </span>
      <span
        aria-hidden="true"
        className={cn('font-medium tabular-nums', active ? 'text-success' : 'text-muted-foreground')}
      >
        {formatClock(span)}
      </span>
      <span className="sr-only">{`${LABEL}, ${active ? 'running' : 'ran'} for ${formatSpokenDuration(span)}`}</span>
    </p>
  );
};
