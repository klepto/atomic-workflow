import type { AttachedSubagent, Subagents } from '../attachment/subagents.ts';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { MethodContext } from './method.ts';

/**
 * Returns the attached subagent `sessionId` of `subagents`. If no such subagent is attached, returns `undefined`
 * instead.
 */
export const attachedSubagent = (sessionId: string, subagents: Subagents): AttachedSubagent | undefined =>
  subagents.list().find((subagent) => subagent.sessionId === sessionId);

/**
 * Returns the registered sessions of the attached subagents, with the services of `context`, in the order of their
 * start. Rejects as the session store of `context` does.
 */
export const attachedSubagentSessions = async (context: MethodContext): Promise<readonly RegisteredSession[]> => {
  const attached = new Set(context.subagents.list().map(({ sessionId }) => sessionId));
  return (await context.sessions.list()).filter(({ id }) => attached.has(id));
};

/**
 * Returns the attached subagents that work on the task `taskId`, with the services of `context`, in the order in which
 * they were started. Rejects as the session store of `context` does.
 */
export const subagentsOfTask = async (taskId: number, context: MethodContext): Promise<readonly AttachedSubagent[]> => {
  const ofTask = new Set(
    (await context.sessions.list())
      .filter((session) => session.role === 'subagent' && session.taskId === taskId)
      .map(({ id }) => id),
  );
  return context.subagents.list().filter(({ sessionId }) => ofTask.has(sessionId));
};
