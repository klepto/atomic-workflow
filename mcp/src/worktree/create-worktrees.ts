import { createTicketWorktree } from './create-ticket-worktree.ts';
import { deleteTaskWorktrees, deleteTicketWorktree } from './delete-worktrees.ts';
import { findTicketChanges, findTicketFilePatch } from './find-ticket-changes.ts';
import { findUnlandedTickets } from './find-unlanded-tickets.ts';
import { mergeTask } from './merge-task.ts';
import { mergeTicket } from './merge-ticket.ts';
import { layoutOf } from './worktree-layout.ts';
import type { CreateWorktreesFunction } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Runs an operation once every operation that came before it has ended, and returns its value.
 */
type Queue = <Value>(operation: () => Promise<Value>) => Promise<Value>;

/**
 * `CreateWorktreesFunction` that keeps the worktrees of the repository in the directory
 * `.atomic-workflow/worktrees/<name of the main checkout>-<hash of its path>/` of the home of the user:
 * `<task id>-<task slug>/main` for a task, and `<task id>-<task slug>/<ticket id>-<ticket slug>` for a ticket. The fork
 * point of each ticket branch is the reference `refs/atomic-workflow/fork-points/<task id>-<task slug>/<ticket
 * id>-<ticket slug>`, which goes away with the branch. Each call runs git in the main checkout, or in the worktree
 * that it works on.
 */
export const createWorktrees: CreateWorktreesFunction = ({ checkout, home, platform }, dependencies) => {
  const context: WorktreesContext = { ...dependencies, layout: layoutOf(checkout, home, platform), platform };
  const queue = createQueue();
  return {
    create: (task, ticket, baseBranch) => queue(() => createTicketWorktree(task, ticket, baseBranch, context)),
    merge: (task, ticket, message) => queue(() => mergeTicket(task, ticket, message, context)),
    ticketChanges: (task, ticket, baseBranch) => queue(() => findTicketChanges(task, ticket, baseBranch, context)),
    ticketFilePatch: (task, ticket, baseBranch, commit, path) =>
      queue(() => findTicketFilePatch(task, ticket, baseBranch, commit, path, context)),
    unlandedTickets: (task, baseBranch) => queue(() => findUnlandedTickets(task, baseBranch, context)),
    mergeTask: (task, baseBranch) => queue(() => mergeTask(task, baseBranch, context)),
    deleteTicket: (task, ticket, force) => queue(() => deleteTicketWorktree(task, ticket, force, context)),
    deleteTask: (task, baseBranch, force) => queue(() => deleteTaskWorktrees(task, baseBranch, force, context)),
  };
};

/**
 * Returns a new `Queue`, which runs one operation at a time, in the order they came.
 */
const createQueue = (): Queue => {
  let last: Promise<unknown> = Promise.resolve();
  return (operation) => {
    const result = last.then(operation);
    // A failed operation does not stop the ones after it.
    last = result.catch(() => undefined);
    return result;
  };
};
