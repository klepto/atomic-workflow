import { readFile } from 'node:fs/promises';
import type { ChangeFeed } from '../changes/change-feed.ts';
import { isNotFound } from '../transcript/is-not-found.ts';
import { NO_USAGE_LIMITS, parseUsageLimits, sameUsageLimits, type UsageLimits } from './usage-limits.ts';
import type { StartUsageReaderFunction } from './usage-reader.ts';

/**
 * Time in ms between two checks of the file, well within the 30 seconds that a change may take to publish.
 */
const POLL_INTERVAL = 10_000;

/**
 * State of one usage reader.
 */
interface Reader {
  /**
   * Absolute path of the global config file of Claude Code.
   */
  readonly path: string;

  /**
   * Change feed that hears of each change of the usage limits.
   */
  readonly changes: ChangeFeed;

  /**
   * Latest usage limits that the reader read.
   */
  held: UsageLimits;

  /**
   * Timer of the next check, or `undefined` while a check runs.
   */
  timer: NodeJS.Timeout | undefined;

  /**
   * Whether the reader is stopped, so that a check under way schedules no next one.
   */
  stopped: boolean;
}

/**
 * `StartUsageReaderFunction` that reads the whole file every `POLL_INTERVAL` ms, and compares the usage limits that it
 * parses, not the text, since Claude Code rewrites the file often for its other fields. A file that does not exist
 * gives `NO_USAGE_LIMITS`. A read that fails for another cause, such as a file that a write holds locked, keeps the
 * usage limits that the reader holds. The timer does not keep the process alive.
 */
export const pollStartUsageReader: StartUsageReaderFunction = async (path, changes) => {
  const held = (await readUsageLimits(path)) ?? NO_USAGE_LIMITS;
  const reader: Reader = { path, changes, held, timer: undefined, stopped: false };
  schedule(reader);
  return {
    latest: () => reader.held,
    stop: () => stop(reader),
  };
};

/**
 * Starts the timer of the next check of `reader`.
 */
const schedule = (reader: Reader): void => {
  reader.timer = setTimeout(() => void check(reader), POLL_INTERVAL);
  // The repository server ends with its last session server, which a pending check must not hold up.
  reader.timer.unref();
};

/**
 * Reads the file of `reader`, publishes `usage` when its usage limits differ from the held ones and holds them, then
 * schedules the next check, unless `reader` stopped meanwhile.
 */
const check = async (reader: Reader): Promise<void> => {
  reader.timer = undefined;
  const read = await readUsageLimits(reader.path);
  if (reader.stopped) return;
  if (read !== undefined && !sameUsageLimits(read, reader.held)) {
    reader.held = read;
    reader.changes.publish('usage');
  }
  schedule(reader);
};

/**
 * Stops `reader`: clears the timer of its next check, and keeps a check under way from scheduling one.
 */
const stop = (reader: Reader): void => {
  reader.stopped = true;
  clearTimeout(reader.timer);
};

/**
 * Returns the usage limits of the file at `path`, `NO_USAGE_LIMITS` when the file does not exist, or `undefined` when
 * it cannot be read for another cause.
 */
const readUsageLimits = async (path: string): Promise<UsageLimits | undefined> => {
  try {
    return parseUsageLimits(await readFile(path, 'utf8'));
  } catch (error) {
    if (isNotFound(error)) return NO_USAGE_LIMITS;
    // A failed read says nothing of the usage limits, and the next check reads the file again.
    return undefined;
  }
};
