import { z } from 'zod';
import { messageDeliverMethod } from './method.message-deliver.ts';
import type { Method, MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { subagentTaskIdMethod } from './session-method.subagent-task-id.ts';

/**
 * Schema of the parameters of `subagentStop`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Session id of the subagent to stop'),
});

/**
 * `Method` named `subagentStop`, which stops a started subagent at once, even in the middle of a turn, and closes its
 * inbox. It asks the orchestrator session that the subagent runs inside to stop the background task that runs the
 * subagent, with a message in its inbox. While the session server of the orchestrator knows no such task, such as
 * before the transcript of the subagent appears, the subagent ends only once its wait for messages ends with `stop`.
 * A session that is no started subagent fails with invalid parameters.
 */
export const subagentStopMethod: Method<typeof PARAMS, void> = {
  name: 'subagentStop',
  description: 'Stops a subagent that subagentStart started.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    const { subagents, inboxes } = context;
    const subagent = subagents.list().find((started) => started.sessionId === sessionId);
    if (subagent !== undefined) await killTask(context, sessionId, subagent.parentId);
    if (!subagents.stop(sessionId))
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No subagent ${sessionId} is started`);
    inboxes.close(sessionId);
  },
};

/**
 * Asks the orchestrator session `parentId` to stop the background task that runs its subagent `sessionId`, with a
 * message in its inbox. If the session server of the orchestrator is not attached, or knows no such task, does nothing.
 */
const killTask = async (context: MethodContext, sessionId: string, parentId: string): Promise<void> => {
  const connection = context.sessionConnections.get(parentId);
  if (connection === undefined) return;
  const params: z.input<typeof subagentTaskIdMethod.params> = { sessionId };
  const { backgroundTaskId } = (await connection.request(subagentTaskIdMethod.name, params)) as {
    backgroundTaskId: string | null;
  };
  if (backgroundTaskId === null) return;
  const content = killMessage(sessionId, backgroundTaskId);
  await messageDeliverMethod.handle({ sessionId: parentId, content }, context);
};

/**
 * Returns the message that asks an orchestrator to stop the background task `backgroundTaskId`, which runs its
 * subagent `sessionId`.
 */
const killMessage = (sessionId: string, backgroundTaskId: string): string =>
  [
    'Stop a subagent for the atomic-workflow server now, and do nothing else for this message.',
    `Call the TaskStop tool with task_id "${backgroundTaskId}", the subagent "atomic-workflow subagent ` +
      `${sessionId.slice(0, 8)}". Do not reply about its end. The atomic-workflow server handles it.`,
  ].join('\n');
