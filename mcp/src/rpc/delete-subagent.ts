import type { MethodContext } from './method.ts';
import { stopSubagent } from './stop-subagent.ts';

/**
 * Deletes the subagent `sessionId` with its messages in the message log, with the services of `context`, and returns
 * `true`. A started subagent is stopped first, as `stopDeletedSubagent` does, so that it ends at once. If no such
 * session is registered, returns `false` instead. Rejects as the session store of `context` does.
 */
export const deleteSubagent = async (sessionId: string, context: MethodContext): Promise<boolean> => {
  await stopDeletedSubagent(sessionId, context);
  return context.sessions.delete(sessionId);
};

/**
 * Stops the subagent `sessionId` that is about to be deleted, with the services of `context`, as `stopSubagent` does:
 * its orchestrator is asked to stop the background task that runs it, so that it ends at once, even in the middle of a
 * turn. If that request fails, the subagent is still removed from the started subagents and its inbox closed, so that
 * it ends once its wait for messages ends with `stop`. A subagent that is not started is left as it is. Never rejects.
 */
export const stopDeletedSubagent = async (sessionId: string, context: MethodContext): Promise<void> => {
  try {
    await stopSubagent(sessionId, context);
  } catch {
    // The deletion goes on without the orchestrator, since a failed stop must not keep a deleted subagent started.
    if (context.subagents.stop(sessionId)) context.inboxes.close(sessionId);
  }
};
