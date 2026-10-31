import { fetchCall } from '@/api/rpc.fetch.ts';
import { type CallFunction, RpcCallError } from '@/api/rpc.ts';
import type { TaskDetail } from '@/api/types.ts';

/**
 * Result of `taskOrchestratorDeliver`.
 */
interface DeliverResult {
  /**
   * Session id of the orchestrator of the task that took the message.
   */
  readonly sessionId: string;
}

/**
 * Adapters that `approveTicket` needs.
 */
interface ApproveTicketDependencies {
  /**
   * Sends each call to the server.
   */
  readonly call: CallFunction;
}

/**
 * Adapters of the page: each call goes to the web server with `fetch`.
 */
const PAGE_DEPENDENCIES: ApproveTicketDependencies = { call: fetchCall };

/**
 * Kinds of the refusals of the worktrees that an agent resolves: a conflict to resolve, and a rebased task branch
 * whose checks must run.
 */
const AGENT_REFUSAL_KINDS: readonly unknown[] = ['conflict', 'needs-checks'];

/**
 * Returns whether the failure `error` is a refusal of the worktrees that an agent resolves.
 */
const isAgentRefusal = (error: unknown): boolean =>
  error instanceof RpcCallError &&
  typeof error.data === 'object' &&
  error.data !== null &&
  'kind' in error.data &&
  AGENT_REFUSAL_KINDS.includes(error.data.kind);

/**
 * Approves the ticket `ticketId` of the task `taskId`, which needs review, and sets it done. Once every ticket of the
 * task is done, lands the task branch on its base branch, which sets the task done. When the landing stops on a
 * conflict, or on a rebased task branch whose checks must run first, hands the approval of the task to the
 * orchestrator of the task, which resolves the conflict or runs the checks and lands it, and returns the session id of
 * that orchestrator. Otherwise returns `undefined`. Each call goes through `call` of `dependencies`, which posts to the
 * web server by default. Rejects with the message of the server when it refuses a step.
 *
 * The steps mirror `## Approve the tickets` and `## Land the task` of the skill `/atomic-workflow:approve` in
 * `plugin/skills/approve/SKILL.md`, so a change of the rule of landing changes both.
 */
export const approveTicket = async (
  taskId: number,
  ticketId: number,
  dependencies: ApproveTicketDependencies = PAGE_DEPENDENCIES,
): Promise<string | undefined> => {
  const { call } = dependencies;
  await call('ticketSetStatus', { taskId, ticketId, status: 'done' });
  const { tickets } = await call<TaskDetail>('taskGet', { task: taskId });
  if (!tickets.every(({ status }) => status === 'done')) {
    return undefined;
  }
  try {
    await call('worktreeMerge', { taskId });
    return undefined;
  } catch (error) {
    if (!isAgentRefusal(error)) {
      throw error;
    }
    const content = `/atomic-workflow:approve ${taskId}`;
    const { sessionId } = await call<DeliverResult>('taskOrchestratorDeliver', { taskId, content });
    return sessionId;
  }
};
