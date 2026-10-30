import { commitOf, forkPointOf, isAncestor, land, setForkPoint } from './branches.ts';
import { continueRebase, MERGE_AGAIN, NO_HOOKS, startRebase, stoppedRebase } from './rebase.ts';
import { gitOutput } from './run-git.ts';
import { branchRef, taskPlaceOf, ticketPlaceOf } from './worktree-layout.ts';
import { checkClean, checkListed, checkNotRebasing, hasStagedChanges } from './worktree-state.ts';
import type { MergedTicket, WorkName, WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Key of the trailer that names the task of the commit of a ticket as `<id>-<slug>`.
 */
export const TASK_TRAILER = 'Atomic-Workflow-Task';

/**
 * Key of the trailer that names the ticket of the commit of a ticket as `<id>-<slug>`.
 */
export const TICKET_TRAILER = 'Atomic-Workflow-Ticket';

/**
 * Returns the work of the ticket `ticket` of the task `task` in the repository of `context` after it landed on the
 * task branch as one commit with the message `message`, as `Worktrees.merge` says.
 * Rejects as `Worktrees.merge` says.
 */
export const mergeTicket = async (
  task: WorkName,
  ticket: WorkName,
  message: string,
  context: WorktreesContext,
): Promise<MergedTicket> => {
  const taskPlace = taskPlaceOf(context.layout, task);
  const place = ticketPlaceOf(context.layout, task, ticket);
  await checkListed(place, context);
  await checkNotRebasing(taskPlace, context);
  const rebase = await stoppedRebase(place.path, context);
  if (rebase === undefined) {
    await squashOnto(place, taskPlace.branch, `${message.trimEnd()}\n\n${trailersOf(task, ticket)}`, context);
  } else {
    await continueRebase(place, taskPlace.branch, MERGE_AGAIN, context);
    await setForkPoint(place.path, place.branch, rebase.onto, context);
  }
  const commit = await land(taskPlace.branch, place, context);
  // The task branch holds the whole ticket branch now, so a later commit of the ticket starts from its tip.
  await setForkPoint(place.path, place.branch, await commitOf(place.path, 'HEAD', context), context);
  return { taskBranch: taskPlace.branch, commit };
};

/**
 * Returns the trailers that name the task `task` and its ticket `ticket` in the message of the commit of the ticket,
 * one per line.
 */
const trailersOf = (task: WorkName, ticket: WorkName): string =>
  `${TASK_TRAILER}: ${task.id}-${task.slug}\n${TICKET_TRAILER}: ${ticket.id}-${ticket.slug}`;

/**
 * Turns the commits of the branch of `place` since it left the task branch `taskBranch` into one commit with the
 * message `message`, and rebases it onto the tip of the task branch, which becomes its fork point. A branch with no
 * commit of its own stays as it is. A branch whose commits change nothing loses them, and stays at the commit where it
 * left the task branch.
 * If the worktree of `place` has changes that no commit holds, rejects with `not-allowed`. If the rebase stops,
 * rejects as `checkRebaseEnded` of `rebase.ts` does.
 */
const squashOnto = async (
  place: WorktreePlace,
  taskBranch: string,
  message: string,
  context: WorktreesContext,
): Promise<void> => {
  await checkClean(place.path, context);
  const taskTip = await commitOf(place.path, branchRef(taskBranch), context);
  const head = await commitOf(place.path, 'HEAD', context);
  const base = await forkPointOrMergeBase(place, taskTip, head, context);
  if (head === base) return;
  await gitOutput(place.path, ['reset', '--quiet', '--soft', base], context.runGit);
  if (!(await hasStagedChanges(place.path, context))) return;
  await gitOutput(place.path, [...NO_HOOKS, 'commit', '--quiet', '--no-verify', '-m', message], context.runGit);
  if (base === taskTip) return;
  await startRebase(place, taskBranch, ['--onto', taskTip, base], MERGE_AGAIN, context);
  await setForkPoint(place.path, place.branch, taskTip, context);
};

/**
 * Returns the commit where the branch of `place`, at the commit `head`, left the task branch: its fork point. For a
 * branch without a fork point, or one that does not hold its fork point, returns the merge base of `head` and the tip
 * `taskTip` of the task branch instead.
 */
const forkPointOrMergeBase = async (
  place: WorktreePlace,
  taskTip: string,
  head: string,
  context: WorktreesContext,
): Promise<string> => {
  const forkPoint = await forkPointOf(place.path, place.branch, context);
  if (forkPoint !== undefined && (await isAncestor(place.path, forkPoint, head, context))) return forkPoint;
  return gitOutput(place.path, ['merge-base', taskTip, head], context.runGit);
};
