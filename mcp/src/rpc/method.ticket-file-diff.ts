import { z } from 'zod';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { ticketOf } from './task-guards.ts';
import { worktreeCall } from './worktree-call.ts';

/**
 * Schema of the parameters of `ticketFileDiff`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the ticket within its task'),
  commit: z.string().min(1).describe('Id of the commit that ticketDiff returned for the ticket'),
  path: z.string().min(1).describe('Path of a changed file that ticketDiff returned for the ticket'),
});

/**
 * Result of `ticketFileDiff`: the patch of one changed file of the commit of a ticket.
 */
interface TicketFilePatch {
  /**
   * Section of the patch of the file, in the form of `ChangedFile.patch`.
   */
  readonly patch: string;
}

/**
 * `Method` named `ticketFileDiff`, which returns the section of the patch of one file of the commit that holds the
 * landed work of a ticket, such as a big file whose patch `ticketDiff` holds back. A task or a ticket that does not
 * exist, and a path that the commit does not change, fail with invalid parameters. A commit that is no longer the
 * commit of the ticket, and a refusal of git, fail with an invalid request.
 */
export const ticketFileDiffMethod: Method<typeof PARAMS, TicketFilePatch> = {
  name: 'ticketFileDiff',
  description:
    'Returns the patch of one changed file of the commit that holds the landed work of a ticket of the atomic workflow.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, ticketId, commit, path }, context) => {
    const task = await findTask(taskId, context.tasks);
    const ticket = ticketOf(task, ticketId);
    const patch = await worktreeCall(() =>
      context.worktrees.ticketFilePatch(task, ticket, task.baseBranch, commit, path),
    );
    if (patch === undefined) {
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Commit ${commit} does not change the file ${path}`);
    }
    return { patch };
  },
};
