import { call, RpcCallError } from '@/api/rpc.ts';
import type { TaskDetail } from '@/api/types.ts';

/**
 * Approves the ticket `ticketId` of the task `taskId`, which needs review, and sets it done. Once every ticket of the
 * task is done, lands the task branch on its base branch, which sets the task done. When the landing stops on a
 * conflict, hands the approval of the task to the orchestrator of the task, which resolves the conflict and lands it,
 * and returns the session id of that orchestrator. Otherwise returns `undefined`. Throws an `Error` with the message of
 * the server when it refuses a step.
 */
export const approveTicket = async (taskId: number, ticketId: number): Promise<string | undefined> => {
  await call('ticketSetStatus', { taskId, ticketId, status: 'done' });
  const { tickets } = await call<TaskDetail>('taskGet', { task: taskId });
  if (!tickets.every(({ status }) => status === 'done')) {
    return undefined;
  }
  try {
    await call('worktreeMerge', { taskId });
    return undefined;
  } catch (error) {
    if (!isConflict(error)) {
      throw error;
    }
    const content = `/atomic-workflow:approve ${taskId}`;
    const { sessionId } = await call<{ sessionId: string }>('taskOrchestratorDeliver', { taskId, content });
    return sessionId;
  }
};

/**
 * Returns whether the failure `error` is a refusal of the worktrees that stopped on a conflict.
 */
const isConflict = (error: unknown) =>
  error instanceof RpcCallError &&
  typeof error.data === 'object' &&
  error.data !== null &&
  'kind' in error.data &&
  error.data.kind === 'conflict';
