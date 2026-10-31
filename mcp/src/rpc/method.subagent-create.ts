import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { callMethod } from './call-method.ts';
import { errorMessage } from './error-message.ts';
import { findTask } from './find-task.ts';
import type { Method, MethodContext } from './method.ts';
import { registerSubagent } from './register-subagent.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { subagentFollowSessionMethod } from './session-method.subagent-follow.ts';
import { aliasOf, IMPLEMENT_JOB } from './session-name.ts';
import { attachedSubagentSessions } from './subagent-queries.ts';
import { ticketOf } from './task-guards.ts';

/**
 * Schema of the parameters of `subagentCreate`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task that the subagent works on'),
  ticketId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Identifier of the ticket of the task that the subagent implements, which names its chat'),
});

/**
 * `Method` named `subagentCreate`, which registers a one-shot subagent of the session of the caller that works on the
 * task `taskId`, and returns its session id. The agent of the caller then starts the subagent itself, with a prompt
 * whose first line names the session id. The subagent counts as attached from the call on, and its transcript is
 * logged until it finishes its prompt. It takes no messages. With `ticketId`, the subagent implements that ticket,
 * and holds the alias `implement-<ticket slug>`, which names its chat. A task or a ticket that does not exist fails
 * with invalid parameters. A caller that serves no attached session fails with an invalid request, and so does a
 * ticket that another attached subagent implements already, such as in a second wave of the same task. A failure of
 * the request `subagentFollow` to the session server of the caller stops the subagent, and fails with an internal
 * error.
 */
export const subagentCreateMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'subagentCreate',
  description:
    'Registers a subagent of this session that works on a task, and returns its session id. Start the subagent with the Agent tool right after, with a prompt whose first line is `Your session id is <session id>.`, so that its chat shows under the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, ticketId }, context) => {
    const { sessions, subagents, caller } = context;
    const task = await findTask(taskId, context.tasks);
    if (ticketId !== undefined) await checkTicket(task, ticketId, context);
    const parentId = sessionOf(context);
    const parent = parentId === undefined ? undefined : await sessions.get(parentId);
    if (caller === undefined || parentId === undefined || parent === undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, 'The caller serves no attached session');
    const job = ticketId === undefined ? null : IMPLEMENT_JOB;
    const work = { taskId, job, ticketId: ticketId ?? null, alias: aliasOf(job, task, ticketId ?? null) };
    const sessionId = await registerSubagent(parent, work, context);
    subagents.start(sessionId, parentId, caller);
    subagents.attach(sessionId);
    try {
      await callMethod(subagentFollowSessionMethod, { sessionId, parentId, oneShot: true }, caller);
    } catch (error) {
      subagents.stop(sessionId);
      throw new RpcError(
        RPC_ERROR_CODES.INTERNAL_ERROR,
        `The subagent ${sessionId} cannot be followed: ${errorMessage(error)}`,
      );
    }
    return { sessionId };
  },
};

/**
 * Returns the id of the session that the connection of the caller serves, with the services of `context`. If the
 * caller serves no session, returns `undefined` instead.
 */
const sessionOf = ({ sessionConnections, caller }: MethodContext): string | undefined =>
  sessionConnections.list().find((sessionId) => sessionConnections.get(sessionId) === caller);

/**
 * Checks that `task` has the ticket `ticketId`, and that no attached subagent implements it already, with the services
 * of `context`. A ticket that does not exist fails with invalid parameters, and a ticket that an attached subagent
 * implements fails with an invalid request.
 */
const checkTicket = async (task: Task, ticketId: number, context: MethodContext): Promise<void> => {
  ticketOf(task, ticketId);
  const busy = (await attachedSubagentSessions(context)).some(
    (session) => session.taskId === task.id && session.ticketId === ticketId,
  );
  if (busy)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_REQUEST,
      `Ticket ${ticketId} of task ${task.id} runs in another subagent already. Wait for it to end`,
    );
};
