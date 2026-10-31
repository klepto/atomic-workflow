import { branchExists, commitOf, makeBranch, setForkPoint } from './branches.ts';
import { joinFailures } from './copy-ignored.ts';
import { forwardSlashes } from './paths.ts';
import { gitOutput } from './run-git.ts';
import { syncTaskBranch } from './sync-task-branch.ts';
import { WorktreeError } from './worktree-error.ts';
import { branchRef, shown, taskPlaceOf, ticketPlaceOf } from './worktree-layout.ts';
import { changes, ensureWorktree } from './worktree-state.ts';
import type { CreatedWorktrees, RebaseChecks, WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns the worktrees of the task `task` and of its ticket `ticket` in the repository of `context`, made where they
 * do not exist, as `Worktrees.create` says. The task branch is made from `baseBranch`, or from the branch that the main
 * checkout has checked out when `baseBranch` is `null`. Before it makes the ticket branch, it syncs the task branch
 * with the base branch as `syncTaskBranch` says, with the checks `checks` of the candidate of an earlier call.
 * Rejects as `Worktrees.create` says.
 */
export const createTicketWorktree = async (
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
  checks: RebaseChecks | undefined,
  context: WorktreesContext,
): Promise<CreatedWorktrees> => {
  const { checkout } = context.layout;
  const taskPlace = taskPlaceOf(context.layout, task);
  const ticketPlace = ticketPlaceOf(context.layout, task, ticket);
  const base = baseBranch ?? (await checkedOutBranch(context));
  const taskBranchCreated = !(await branchExists(taskPlace.branch, context));
  const uncommittedChanges = taskBranchCreated && (await changes(checkout, false, context)).length > 0;
  if (taskBranchCreated) await makeBranch(taskPlace.branch, base, context);
  await gitOutput(checkout, ['worktree', 'prune'], context.runGit);
  const taskFailures = await ensureWorktree(taskPlace, true, context);
  const ticketBranchCreated = !(await branchExists(ticketPlace.branch, context));
  const sync = await syncTaskBranch(task, base, ticketBranchCreated, checks, context);
  if (ticketBranchCreated) await makeTicketBranch(ticketPlace.branch, taskPlace.branch, context);
  const ticketFailures = await ensureWorktree(ticketPlace, true, context);
  return {
    task: shown(taskPlace),
    ticket: shown(ticketPlace),
    baseBranch: base,
    taskBranchCreated,
    ticketBranchCreated,
    taskBranchSynced: sync.synced,
    uncommittedChanges,
    copyFailures: joinFailures(taskFailures, ticketFailures),
    warnings: sync.warnings,
  };
};

/**
 * Returns the name of the branch that the main checkout of the repository of `context` has checked out.
 * If it has none checked out, rejects with `not-allowed`.
 */
const checkedOutBranch = async (context: WorktreesContext): Promise<string> => {
  const { checkout } = context.layout;
  const output = await context.runGit(checkout, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (output.exitCode === 0) return output.stdout.trim();
  throw new WorktreeError(
    'not-allowed',
    `The main checkout ${forwardSlashes(checkout)} has no branch checked out, so the task branch has no base. Check out the branch to base the task on, then try again`,
  );
};

/**
 * Makes the ticket branch `branch` at the tip of the task branch `taskBranch` in the repository of `context`, and
 * records that tip as its fork point.
 * If git refuses to make the branch, rejects with `not-allowed`.
 */
const makeTicketBranch = async (branch: string, taskBranch: string, context: WorktreesContext): Promise<void> => {
  const { checkout } = context.layout;
  const taskTip = await commitOf(checkout, branchRef(taskBranch), context);
  await makeBranch(branch, taskTip, context);
  await setForkPoint(checkout, branch, taskTip, context);
};
