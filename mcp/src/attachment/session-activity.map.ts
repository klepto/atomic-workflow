import type { ActivityStatus, CreateSessionActivityFunction } from './session-activity.ts';

/**
 * Status of one session, with the time of its latest report.
 */
interface ReportedStatus {
  /**
   * Status of the session.
   */
  readonly status: ActivityStatus;

  /**
   * Time of the latest report of the session, in ms since the epoch.
   */
  readonly at: number;
}

/**
 * `CreateSessionActivityFunction` that keeps the status of each session in a map, by session.
 */
export const mapCreateSessionActivity: CreateSessionActivityFunction = () => {
  const statuses = new Map<string, ReportedStatus>();
  return {
    report: (sessionId, status, at) => report(statuses, sessionId, status, at),
    get: (sessionId) => statuses.get(sessionId)?.status,
  };
};

/**
 * Sets the status of the session `sessionId` in `statuses` to `status` from the time `at` on, unless the session
 * reported a later time already, and returns whether the status changed.
 */
const report = (
  statuses: Map<string, ReportedStatus>,
  sessionId: string,
  status: ActivityStatus,
  at: number,
): boolean => {
  const current = statuses.get(sessionId);
  if (current !== undefined && at < current.at) return false;
  statuses.set(sessionId, { status, at });
  return current?.status !== status;
};
