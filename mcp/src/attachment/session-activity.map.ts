import type { Activity, ActivityStatus, CreateSessionActivityFunction } from './session-activity.ts';

/**
 * Activity of one session, with the times of its latest reports.
 */
interface ReportedActivity {
  /**
   * Status of the session.
   */
  readonly status: ActivityStatus;

  /**
   * Time of the latest report of a status of the session, in ms since the epoch.
   */
  readonly at: number;

  /**
   * Time when the current turn started, in ms since the epoch, or `null` while no turn runs.
   */
  readonly turnStartedAt: number | null;

  /**
   * Time when the latest turn ended, in ms since the epoch, or `null` when no turn ended yet.
   */
  readonly turnEndedAt: number | null;

  /**
   * Newest action of the current turn, or `null` for none.
   */
  readonly action: string | null;

  /**
   * Time of the latest report of an action of the session, in ms since the epoch, or `null` for none.
   */
  readonly actionAt: number | null;
}

/**
 * `CreateSessionActivityFunction` that keeps the activity of each session in a map, by session.
 */
export const mapCreateSessionActivity: CreateSessionActivityFunction = () => {
  const activities = new Map<string, ReportedActivity>();
  return {
    report: (sessionId, status, at) => update(activities, sessionId, (current) => reported(current, status, at)),
    reportAction: (sessionId, action, at) =>
      update(activities, sessionId, (current) => actionReported(current, action, at)),
    forget: (sessionId) => activities.delete(sessionId),
    get: (sessionId) => {
      const current = activities.get(sessionId);
      return current === undefined ? undefined : activityOf(current);
    },
  };
};

/**
 * Replaces the activity of the session `sessionId` in `activities` with what `next` returns for it, and returns
 * whether the activity that `activityOf` shows changed.
 */
const update = (
  activities: Map<string, ReportedActivity>,
  sessionId: string,
  next: (current: ReportedActivity | undefined) => ReportedActivity | undefined,
): boolean => {
  const current = activities.get(sessionId);
  const updated = next(current);
  if (updated === undefined) return false;
  activities.set(sessionId, updated);
  return current === undefined || !sameActivity(activityOf(current), activityOf(updated));
};

/**
 * Returns the activity `current` after a report of the status `status` at the time `at`. If the report changes
 * nothing, returns `undefined` instead.
 */
const reported = (
  current: ReportedActivity = UNREPORTED,
  status: ActivityStatus,
  at: number,
): ReportedActivity | undefined => {
  if (at < current.at) return movedTurnStart(current, status, at);
  if (status === 'idle') return { ...current, status, at, turnStartedAt: null, turnEndedAt: at, action: null };
  return { ...current, status, at, turnStartedAt: current.turnStartedAt ?? at };
};

/**
 * Activity of a session that has reported nothing yet, which every report of a status takes as later.
 */
const UNREPORTED: ReportedActivity = {
  status: 'idle',
  at: Number.NEGATIVE_INFINITY,
  turnStartedAt: null,
  turnEndedAt: null,
  action: null,
  actionAt: null,
};

/**
 * Returns the activity `current` with the start of its turn moved back to `at`, for a late report of the status
 * `status` at the time `at`, when the status is not `idle`, a turn runs that started after `at`, and `at` falls after
 * the end of the turn before. Otherwise returns `undefined`.
 */
const movedTurnStart = (
  current: ReportedActivity,
  status: ActivityStatus,
  at: number,
): ReportedActivity | undefined => {
  const { turnStartedAt, turnEndedAt } = current;
  if (status === 'idle' || turnStartedAt === null || at >= turnStartedAt) return undefined;
  if (turnEndedAt !== null && at <= turnEndedAt) return undefined;
  return { ...current, turnStartedAt: at };
};

/**
 * Returns the activity `current` after a report of the action `action` at the time `at`. If the session has no
 * activity, or the report is older than its latest action or than the end of its latest turn, returns `undefined`
 * instead.
 */
const actionReported = (
  current: ReportedActivity | undefined,
  action: string | null,
  at: number,
): ReportedActivity | undefined => {
  if (current === undefined) return undefined;
  if (current.actionAt !== null && at < current.actionAt) return undefined;
  if (current.turnEndedAt !== null && at <= current.turnEndedAt) return undefined;
  return { ...current, action, actionAt: at };
};

/**
 * Returns the activity that the reported activity `reported` shows: its action only while its status is `working`.
 */
const activityOf = ({ status, turnStartedAt, action }: ReportedActivity): Activity => ({
  status,
  turnStartedAt,
  latestAction: status === 'working' ? action : null,
});

/**
 * Returns whether the activities `a` and `b` are the same.
 */
const sameActivity = (a: Activity, b: Activity): boolean =>
  a.status === b.status && a.turnStartedAt === b.turnStartedAt && a.latestAction === b.latestAction;
