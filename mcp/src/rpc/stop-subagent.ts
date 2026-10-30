import { callMethod } from './call-method.ts';
import { deliverServerMessage } from './deliver-message.ts';
import type { MethodContext } from './method.ts';
import { subagentTaskIdSessionMethod } from './session-method.subagent-task-id.ts';
import { attachedSubagent } from './subagent-queries.ts';

/**
 * Stops the started subagent `sessionId` at once, even in the middle of a turn, with the services of `context`, closes
 * its inbox, and returns `true`. For an attached subagent, it first asks the orchestrator session that the subagent
 * runs inside to stop the background task that runs it, with a message in the inbox of the orchestrator. While the
 * session server of the orchestrator knows no such task, the subagent ends only once its wait for messages ends with
 * `stop`. If no such subagent is started, returns `false` instead. Rejects as the request `subagentTaskId` to the
 * session server of the orchestrator does, and fails with invalid parameters when the orchestrator has no inbox. The
 * subagent then stays started.
 */
export const stopSubagent = async (sessionId: string, context: MethodContext): Promise<boolean> => {
  const { subagents, inboxes } = context;
  const subagent = attachedSubagent(sessionId, subagents);
  if (subagent !== undefined) await killTask(sessionId, subagent.parentId, context);
  if (!subagents.stop(sessionId)) return false;
  inboxes.close(sessionId);
  return true;
};

/**
 * Asks the orchestrator session `parentId` to stop the background task that runs its subagent `sessionId`, with a
 * message in its inbox, with the services of `context`. If the session server of the orchestrator is not attached, or
 * knows no such task, does nothing. Rejects as `stopSubagent` does.
 */
const killTask = async (sessionId: string, parentId: string, context: MethodContext): Promise<void> => {
  const connection = context.sessionConnections.get(parentId);
  if (connection === undefined) return;
  const { backgroundTaskId } = await callMethod(subagentTaskIdSessionMethod, { sessionId }, connection);
  if (backgroundTaskId === null) return;
  deliverServerMessage(parentId, killMessage(sessionId, backgroundTaskId), context.inboxes);
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
