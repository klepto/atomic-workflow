import type { TranscriptAction, TranscriptActivity, TranscriptEntry, TranscriptUsage } from './find-transcript.ts';

/**
 * State of the agent that a run of entries of a transcript shows.
 */
export interface EntriesSummary {
  /**
   * Statuses of the agent that the entries show from the start of the log on, in order, each at the first entry that
   * shows it: the first status, and each status that differs from the one before. So the first entry of a turn gives
   * its start, even when the same entries show the rest of the turn.
   */
  readonly statusChanges: readonly TranscriptActivity[];

  /**
   * Action of the agent that the last entry with an action shows, among the entries from the start of the log on, or
   * `undefined` when none shows one.
   */
  readonly action: TranscriptAction | undefined;

  /**
   * Token usage that the last entry with a usage shows, among all the entries, or `undefined` when none shows one. An
   * entry from before the start of the log counts too, since the newest usage gives the size of the context now.
   */
  readonly usage: TranscriptUsage | undefined;
}

/**
 * Returns the state of the agent that the entries `entries` of a transcript show, in their order. The log of the
 * transcript started at the time `since`, in ms since the epoch: an entry from before it shows the past, not the
 * status or the action now.
 */
export const summarizeEntries = (entries: readonly TranscriptEntry[], since: number): EntriesSummary => {
  const activities = entries
    .map((entry) => entry.activity)
    .filter((activity): activity is TranscriptActivity => activity !== undefined && activity.timestamp >= since);
  return {
    statusChanges: activities.filter((activity, index) => activities[index - 1]?.status !== activity.status),
    action: entries
      .map((entry) => entry.action)
      .findLast((action) => action !== undefined && action.timestamp >= since),
    usage: entries.map((entry) => entry.usage).findLast((usage) => usage !== undefined),
  };
};
