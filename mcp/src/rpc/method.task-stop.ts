import { z } from 'zod';
import type { AttachedSubagent } from '../attachment/subagents.ts';
import type { ClaimHolder } from '../attachment/ticket-claims.ts';
import type { Task } from '../storage/task-store.ts';
import { stopSubagent } from './method.subagent-stop.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { hasLanded } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `taskStop`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task whose subagents to stop'),
});

/**
 * Result of `taskStop`.
 */
interface TaskStopResult {
  /**
   * Session ids of the subagents of the task that the call stopped, in any order.
   */
  readonly stopped: string[];
}

/**
 * Outcome of the stop of one started subagent: whether it was still started and stopped now, or why its stop failed.
 */
type StopOutcome =
  | { readonly subagent: AttachedSubagent; readonly stopped: boolean }
  | { readonly subagent: AttachedSubagent; readonly failure: string };

/**
 * `Method` named `taskStop`, which stops every started subagent that works on the task `taskId` at once, as
 * `subagentStop` does: the orchestrator of the task, and each subagent that implements a ticket of it. It returns the
 * session id of each subagent that it stopped. An orchestrator session, the main session of the agent, is no subagent,
 * so it keeps running. Each subagent of an orchestrator session calls over the connection of that session, so the call
 * then releases each claim of a ticket of the task that has not landed and that such a connection holds. Each ticket
 * keeps its status, its stage and its worktree, so a later run resumes it. The call ends the active run of the task, as
 * `taskRunEnd` does, also when it stops no subagent. A task that does not exist fails with
 * invalid parameters. A subagent that fails to stop does not stop the others: the call stops every other one, then
 * fails with an internal error that names each failure.
 */
export const taskStopMethod: Method<typeof PARAMS, TaskStopResult> = {
  name: 'taskStop',
  description:
    'Stops every subagent that works on a task, releases the claims of its tickets, and ends its active run.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId }, context) => {
    const task = await taskGetMethod.handle({ task: taskId }, context);
    const subagents = await subagentsOf(taskId, context);
    const outcomes = await Promise.all(subagents.map((subagent) => stopOne(subagent, context)));
    const stopped = outcomes.flatMap((outcome) => ('stopped' in outcome && outcome.stopped ? [outcome.subagent] : []));
    releaseClaims(task, holdersOf(stopped, context), context);
    await context.tasks.endRun(taskId, Date.now());
    const failures = outcomes.flatMap((outcome) =>
      'failure' in outcome ? [`${outcome.subagent.sessionId}: ${outcome.failure}`] : [],
    );
    if (failures.length > 0)
      throw new RpcError(
        RpcErrorCode.INTERNAL_ERROR,
        `Could not stop ${failures.length === 1 ? 'a subagent' : 'subagents'} of task ${taskId}: ${failures.join('; ')}`,
      );
    return { stopped: stopped.map(({ sessionId }) => sessionId) };
  },
};

/**
 * Returns the started subagents that work on the task `taskId`, with the services of `context`.
 */
const subagentsOf = async (taskId: number, context: MethodContext): Promise<AttachedSubagent[]> => {
  const ofTask = new Set(
    (await context.sessions.list())
      .filter((session) => session.role === 'subagent' && session.taskId === taskId)
      .map(({ id }) => id),
  );
  return context.subagents.list().filter(({ sessionId }) => ofTask.has(sessionId));
};

/**
 * Stops `subagent` with the services of `context`, and returns the outcome. A subagent that ended in between counts as
 * not stopped, and a failure of the stop is part of the outcome.
 */
const stopOne = async (subagent: AttachedSubagent, context: MethodContext): Promise<StopOutcome> => {
  try {
    return { subagent, stopped: await stopSubagent(context, subagent.sessionId) };
  } catch (error) {
    return { subagent, failure: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Returns the connections of the orchestrator sessions that the subagents `subagents` run inside, with the services of
 * `context`, which hold the claims of the tickets that those subagents work on. A session that is no longer attached
 * holds no claim, and is left out.
 */
const holdersOf = (subagents: readonly AttachedSubagent[], context: MethodContext): Set<ClaimHolder> =>
  new Set(subagents.flatMap(({ parentId }) => context.sessionConnections.get(parentId) ?? []));

/**
 * Releases each claim of a ticket of `task` that has not landed and that one of `holders` holds, with the services of
 * `context`. A claim of another holder stays.
 */
const releaseClaims = (task: Task, holders: ReadonlySet<ClaimHolder>, context: MethodContext): void => {
  const { ticketClaims } = context;
  for (const ticket of task.tickets) {
    if (hasLanded(ticket.status)) continue;
    // A ticket that no holder holds counts as not held by another, and its release changes nothing.
    if ([...holders].some((holder) => !ticketClaims.isHeldByOther(task.id, ticket.id, holder)))
      ticketClaims.release(task.id, ticket.id);
  }
};
