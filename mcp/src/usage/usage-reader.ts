import { join } from 'node:path';
import type { ChangeFeed } from '../changes/change-feed.ts';
import type { UsageLimits } from './usage-limits.ts';

/**
 * Name of the global config file of Claude Code, which holds the cache of the usage limits of the account.
 */
const CONFIG_FILE = '.claude.json';

/**
 * Reader of the usage limits of the account, which follows the global config file of Claude Code.
 */
export interface UsageReader {
  /**
   * Returns the latest usage limits that the reader holds, `NO_USAGE_LIMITS` while the file holds none.
   */
  latest(): UsageLimits;

  /**
   * Stops the checks of the file, so that the process can exit.
   */
  stop(): void;
}

/**
 * Function that reads the usage limits from the global config file of Claude Code at `path` once, and resolves with
 * a reader that holds them. The reader then checks the file for a change at least every 30 seconds, and publishes
 * `usage` to `changes` when the usage limits that it reads differ from the ones that it holds. It only reads the
 * file, and never rejects for its content.
 */
export type StartUsageReaderFunction = (path: string, changes: ChangeFeed) => Promise<UsageReader>;

/**
 * Returns the path of the global config file of Claude Code: `.claude.json` in `configDirectory`, the value of the
 * environment variable `CLAUDE_CONFIG_DIR`, when it is set and not empty, and in `home` otherwise.
 */
export const claudeConfigPath = (configDirectory: string | undefined, home: string): string =>
  join(configDirectory || home, CONFIG_FILE);
