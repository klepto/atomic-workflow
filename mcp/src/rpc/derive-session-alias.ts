import type { MethodContext } from './method.ts';
import { aliasOf, PLAN_JOB } from './session-name.ts';

/**
 * Gives the subagent `sessionId` the alias of its job and its target, with the services of `context`, once its target
 * is known, as `aliasOf` builds it. A subagent with no job that created its task, as `created` says, gets the alias of
 * the job `plan` instead, such as `plan-cache-layer-redis`. A subagent that holds an alias keeps it, and an
 * orchestrator session or a session that is not registered stays as it is. Rejects as the stores of `context` do.
 */
export const deriveSessionAlias = async (
  sessionId: string,
  created: boolean,
  context: MethodContext,
): Promise<void> => {
  const session = await context.sessions.get(sessionId);
  if (session === undefined || session.role !== 'subagent' || session.alias !== null) return;
  const task = session.taskId === null ? undefined : await context.tasks.get(session.taskId);
  const job = session.job ?? (created ? PLAN_JOB : null);
  const alias = aliasOf(job, task, session.ticketId);
  if (alias !== null) await context.sessions.setAlias(sessionId, alias);
};
