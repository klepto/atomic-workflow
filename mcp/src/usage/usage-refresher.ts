import { errorMessage } from '../rpc/error-message.ts';
import type { LogFunction } from '../session/log.ts';
import type { RefreshUsageFunction } from './usage-refresh.ts';

/**
 * Refresher of the cached usage limits of the account, which runs one refresh at a time.
 */
export interface UsageRefresher {
  /**
   * Asks for a refresh of the usage limits, and returns at once. While a refresh runs, the requests are merged into
   * one more refresh after it, so a burst of requests runs at most two refreshes.
   */
  request(): void;
}

/**
 * Adapters that `createUsageRefresher` needs.
 */
export interface UsageRefresherDependencies {
  /**
   * Runs one refresh.
   */
  readonly refresh: RefreshUsageFunction;

  /**
   * Writes the failure of a refresh.
   */
  readonly log: LogFunction;
}

/**
 * State of one usage refresher.
 */
interface Refresher {
  /**
   * Adapters of the refresher.
   */
  readonly dependencies: UsageRefresherDependencies;

  /**
   * Whether a refresh runs.
   */
  running: boolean;

  /**
   * Whether a request came while a refresh ran, so that one more refresh follows it.
   */
  pending: boolean;
}

/**
 * Returns a usage refresher that runs each refresh with `refresh` of `dependencies`. A failed refresh goes to `log`,
 * and the next request tries again.
 */
export const createUsageRefresher = (dependencies: UsageRefresherDependencies): UsageRefresher => {
  const refresher: Refresher = { dependencies, running: false, pending: false };
  return { request: () => request(refresher) };
};

/**
 * Starts a refresh of `refresher`, or marks one as pending while a refresh runs.
 */
const request = (refresher: Refresher): void => {
  if (refresher.running) {
    refresher.pending = true;
    return;
  }
  refresher.running = true;
  void run(refresher);
};

/**
 * Runs refreshes of `refresher` until no request is pending, and writes each failure to its log.
 */
const run = async (refresher: Refresher): Promise<void> => {
  const { refresh, log } = refresher.dependencies;
  do {
    refresher.pending = false;
    try {
      await refresh();
    } catch (error) {
      log(`Could not refresh the usage limits: ${errorMessage(error)}`);
    }
  } while (refresher.pending);
  refresher.running = false;
};
