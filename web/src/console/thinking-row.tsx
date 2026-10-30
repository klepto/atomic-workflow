import { LoaderCircle } from 'lucide-react';
import { formatDuration } from '@/time/duration-format.ts';
import { useNow } from '@/time/use-now.ts';

/**
 * Props of `ThinkingRow`.
 */
interface ThinkingRowProps {
  /**
   * Time when the current turn of the agent started, in ms since the epoch, or `null` while it is not known.
   */
  readonly since: number | null;

  /**
   * Newest tool call of the agent, in one line, or `null` while it has none to show.
   */
  readonly action: string | null;
}

/**
 * Props of `TurnTime`.
 */
interface TurnTimeProps {
  /**
   * Time when the turn of the agent started, in ms since the epoch.
   */
  readonly since: number;
}

/**
 * Time that the turn of the agent has run since `since`, in parentheses such as `(1m 56s)`, counting up once per
 * second.
 */
const TurnTime = ({ since }: TurnTimeProps) => {
  const now = useNow(true);
  return <span className="tabular-nums">({formatDuration(now - since)})</span>;
};

/**
 * Row at the end of the log while the agent of the chat works: the newest tool call `action` in one muted line,
 * cut with an ellipsis and whole on hover, over a spinning icon, the word `Thinking` and the time of the turn since
 * `since`. The line of the tool call is left out while `action` is `null`, and the time while `since` is `null`. The
 * icon stands still for a user who asks for reduced motion.
 */
export const ThinkingRow = ({ since, action }: ThinkingRowProps) => (
  <div role="status" className="flex min-w-0 flex-col gap-0.5 self-stretch">
    {action !== null && (
      <p title={action} className="truncate font-mono text-muted-foreground/80 text-xs leading-5">
        {action}
      </p>
    )}
    <p className="flex items-center gap-2 text-muted-foreground text-sm leading-6">
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      Thinking
      {since !== null && <TurnTime since={since} />}
    </p>
  </div>
);
