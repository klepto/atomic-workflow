import { mapCreateSessionActivity } from './session-activity.map.ts';

/**
 * Statuses of the agent of a session: `idle` while it waits for its next message, `working` while a turn runs, and
 * `waiting` while it is blocked on the user, such as by a permission prompt or a question in the terminal.
 */
export const ACTIVITY_STATUSES = ['idle', 'working', 'waiting'] as const;

/**
 * Status of the agent of a session, one of `ACTIVITY_STATUSES`.
 */
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/**
 * Status of the agent of each session, as the session reports it.
 */
export interface SessionActivity {
  /**
   * Sets the status of the session `sessionId` to `status`, as it stands from the time `at` on, in ms since the epoch,
   * and returns whether the status changed. A report older than the latest report of the session is ignored, so a
   * late report of an earlier time does not undo a newer status.
   */
  report(sessionId: string, status: ActivityStatus, at: number): boolean;

  /**
   * Returns the status of the session `sessionId`. If the session has reported no status, returns `undefined`
   * instead.
   */
  get(sessionId: string): ActivityStatus | undefined;
}

/**
 * Function that returns a new activity, with no status reported.
 */
export type CreateSessionActivityFunction = () => SessionActivity;

/**
 * Default `CreateSessionActivityFunction`, which keeps the statuses in memory.
 */
export const CreateSessionActivity: CreateSessionActivityFunction = mapCreateSessionActivity;
