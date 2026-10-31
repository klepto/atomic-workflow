import type { ListedSession, TaskSummary } from '@/api/types.ts';

/**
 * Returns the time of the last activity of the task `task` among the sessions `sessions`, in ms since the epoch: the
 * latest of its creation, the start and the end of its latest run, and the latest message or start of each session
 * that works on it.
 */
const taskActivityOf = (task: TaskSummary, sessions: readonly ListedSession[]): number =>
  Math.max(
    task.createdAt,
    task.runStartedAt ?? 0,
    task.runEndedAt ?? 0,
    ...sessions
      .filter((session) => session.taskId === task.id)
      .map((session) => session.lastActivityAt ?? session.startedAt ?? 0),
  );

/**
 * Returns the tasks `tasks` in the order of their last activity among the sessions `sessions`, the latest first. The
 * last activity of a task is the latest of its creation, the start and the end of its latest run, and the latest
 * message or start of each session that works on it. Tasks with the same last activity keep their order in `tasks`.
 */
export const orderByActivity = (
  tasks: readonly TaskSummary[],
  sessions: readonly ListedSession[],
): readonly TaskSummary[] => {
  const activities = new Map(tasks.map((task) => [task.id, taskActivityOf(task, sessions)]));
  return tasks.toSorted((first, second) => (activities.get(second.id) ?? 0) - (activities.get(first.id) ?? 0));
};
