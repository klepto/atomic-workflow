import { formatModel } from '@/conversation/model-format.ts';
import { formatDuration } from '@/time/duration-format.ts';
import { useNow } from '@/time/use-now.ts';

/**
 * Props of `SessionBar`.
 */
interface SessionBarProps {
  /**
   * Time when the session started, in ms since the epoch, or `null` while it is not known.
   */
  readonly startedAt: number | null;

  /**
   * Time when the running time of the session stopped, in ms since the epoch, or `null` while the session is
   * attached and the time counts up.
   */
  readonly stoppedAt: number | null;

  /**
   * Size of the context of the session in tokens, or `null` before its first model request.
   */
  readonly contextTokens: number | null;

  /**
   * Model of the newest model request of the session, such as `claude-opus-5-5`, or `null` while it is not known.
   */
  readonly model: string | null;

  /**
   * Reasoning effort of the newest model request of the session, such as `xhigh`, or `null` while it is not known.
   */
  readonly effort: string | null;
}

/**
 * Number of tokens from which a context size shows in thousands.
 */
const THOUSAND = 1000;

/**
 * Text between two parts of the line.
 */
const SEPARATOR = ' - ';

/**
 * Returns the context size `tokens` in short: the number as is below 1000, such as `850`, and else in thousands,
 * rounded to the nearest one, with `k`, such as `149k`.
 */
const formatTokens = (tokens: number): string =>
  tokens < THOUSAND ? String(tokens) : `${Math.round(tokens / THOUSAND)}k`;

/**
 * Returns the model `model` in short, as `formatModel` words it, with the effort `effort` in parentheses, such as
 * `Opus 5.5 (xhigh)`. The effort is left out while it is `null`.
 */
const formatModelEffort = (model: string, effort: string | null): string =>
  effort === null ? formatModel(model) : `${formatModel(model)} (${effort})`;

/**
 * Line of a session above the composer: its model with its effort, then its context size, then its running time
 * from `startedAt`, such as `Opus 5.5 (xhigh) - 149k - 19m 30s`. The running time counts up once per second while
 * `stoppedAt` is `null`, and else spans to `stoppedAt` and stays still. The model is left out while `model` is `null`,
 * and the context size while `contextTokens` is `null`. It renders nothing while `startedAt` is `null`.
 */
export const SessionBar = ({ startedAt, stoppedAt, contextTokens, model, effort }: SessionBarProps) => {
  const now = useNow(startedAt !== null && stoppedAt === null);
  if (startedAt === null) {
    return null;
  }
  const parts = [
    model === null ? null : formatModelEffort(model, effort),
    contextTokens === null ? null : formatTokens(contextTokens),
    formatDuration((stoppedAt ?? now) - startedAt),
  ];
  return (
    <p className="px-2 pb-1.5 text-muted-foreground text-xs tabular-nums">
      {parts.filter((part) => part !== null).join(SEPARATOR)}
    </p>
  );
};
