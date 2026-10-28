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
 * Activity of the agent of a session: its status, the start of its current turn, and its newest action.
 */
export interface Activity {
  /**
   * Status of the agent.
   */
  readonly status: ActivityStatus;

  /**
   * Time when the current turn started, in ms since the epoch. `null` while the status is `idle`.
   */
  readonly turnStartedAt: number | null;

  /**
   * Newest tool call of the current turn, in one line. `null` while the status is not `working`, and when the agent
   * made no tool call since its newest text message.
   */
  readonly latestAction: string | null;
}

/**
 * Activity of the agent of each session, as the session reports it.
 */
export interface SessionActivity {
  /**
   * Sets the status of the session `sessionId` to `status`, as it stands from the time `at` on, in ms since the epoch,
   * and returns whether its activity changed. A status other than `idle` starts a turn at `at` when no turn runs, and
   * `idle` ends the turn. A report older than the latest report of the session does not change its status, so a late
   * report of an earlier time does not undo a newer status. A late report of `working` or `waiting` still moves the
   * start of the current turn back to `at`, when it falls after the end of the turn before.
   */
  report(sessionId: string, status: ActivityStatus, at: number): boolean;

  /**
   * Sets the newest action of the session `sessionId` to `action` from the time `at` on, or to none with `null`, and
   * returns whether its activity changed. An action older than the latest action of the session, or than the end of
   * its latest turn, is ignored.
   */
  reportAction(sessionId: string, action: string | null, at: number): boolean;

  /**
   * Forgets the status, the turn and the action of the session `sessionId`, as when it starts anew, and returns
   * whether it had any.
   */
  forget(sessionId: string): boolean;

  /**
   * Returns the activity of the session `sessionId`. If the session has reported no status, returns `undefined`
   * instead.
   */
  get(sessionId: string): Activity | undefined;
}

/**
 * Function that returns a new activity, with no status reported.
 */
export type CreateSessionActivityFunction = () => SessionActivity;

/**
 * Default `CreateSessionActivityFunction`, which keeps the statuses in memory.
 */
export const CreateSessionActivity: CreateSessionActivityFunction = mapCreateSessionActivity;
