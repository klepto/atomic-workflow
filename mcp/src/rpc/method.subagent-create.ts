import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { subagentFollowMethod } from './session-method.subagent-follow.ts';

/**
 * Schema of the parameters of `subagentCreate`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task that the subagent works on'),
});

/**
 * `Method` named `subagentCreate`, which registers a one-shot subagent of the session of the caller that works on the
 * task `taskId`, and returns its session id. The agent of the caller then starts the subagent itself, with a prompt
 * whose first line names the session id. The subagent counts as attached from the call on, and its transcript is
 * logged until it finishes its prompt. It takes no messages. A task that does not exist fails with invalid
 * parameters. A caller that serves no attached session fails with an invalid request.
 */
export const subagentCreateMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'subagentCreate',
  description:
    'Registers a subagent of this session that works on a task, and returns its session id. Start the subagent with the Agent tool right after, with a prompt whose first line is `Your session id is <session id>.`, so that its chat shows under the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, context) => {
    const { sessions, subagents, caller } = context;
    await taskGetMethod.handle({ task: taskId }, context);
    const parentId = sessionOf(context);
    const parent = parentId === undefined ? undefined : await sessions.get(parentId);
    if (caller === undefined || parentId === undefined || parent === undefined)
      throw new RpcError(RpcErrorCode.INVALID_REQUEST, 'The caller serves no attached session');
    const sessionId = randomUUID();
    const { agent, directory } = parent;
    await sessions.register({
      id: sessionId,
      agent,
      directory,
      startedAt: Date.now(),
      role: 'subagent',
      parentId,
      taskId,
    });
    subagents.start(sessionId, parentId, caller);
    subagents.attach(sessionId);
    const params: z.input<typeof subagentFollowMethod.params> = { sessionId, parentId, oneShot: true };
    try {
      await caller.request(subagentFollowMethod.name, params);
    } catch (error) {
      subagents.stop(sessionId);
      const reason = error instanceof Error ? error.message : String(error);
      throw new RpcError(RpcErrorCode.INTERNAL_ERROR, `The subagent ${sessionId} cannot be followed: ${reason}`);
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
