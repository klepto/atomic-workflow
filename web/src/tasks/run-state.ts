import type { ListedSession, TaskSummary } from '@/api/types.ts';

/**
 * Run state of a task: whether a run of it is active, and whether any of its subagents runs.
 */
export interface RunState {
  /**
   * Whether a subagent of the task is `working` or `waiting`.
   */
  readonly active: boolean;

  /**
   * Whether a subagent of the task has a status other than `ended`.
   */
  readonly running: boolean;
}

/**
 * Returns the run state of the task `taskId` among the sessions `sessions`, whose subagents of the task are the ones
 * with the role `subagent` and the task id `taskId`.
 */
export const runStateOf = (taskId: number, sessions: readonly ListedSession[]): RunState => {
  const subagents = sessions.filter((session) => session.role === 'subagent' && session.taskId === taskId);
  return {
    active: subagents.some((session) => session.status === 'working' || session.status === 'waiting'),
    running: subagents.some((session) => session.status !== 'ended'),
  };
};

/**
 * Returns whether the latest unattended run of the task `task` is active: it started, and has not ended.
 */
export const isRunActive = (task: TaskSummary): boolean => task.runStartedAt !== null && task.runEndedAt === null;
