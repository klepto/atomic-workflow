import { commitOf, forkPointOf, isAncestor, land, setForkPoint } from './branches.ts';
import { findTicketCommit } from './find-ticket-changes.ts';
import { continueRebase, MERGE_AGAIN, NO_HOOKS, startRebase, stoppedRebase } from './rebase.ts';
import { gitFailure, gitOutput } from './run-git.ts';
import { branchRef, taskPlaceOf, ticketPlaceOf } from './worktree-layout.ts';
import { checkClean, checkListed, checkNotRebasing } from './worktree-state.ts';
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
  // Only the move of the task branch puts a commit with the trailers of the ticket there, so a merge that stopped after
  // it has only the fork point left to record, and must not land the ticket a second time.
  const landed = await findTicketCommit(task, ticket, null, context);
  if (landed !== undefined) {
    await finishLanded(place, landed, context);
    return { taskBranch: taskPlace.branch, commit: landed };
  }
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
 * left the task branch. Each step leaves a state that a later call squashes again into the same one commit, so a stop
 * between two steps loses no work and duplicates no commit.
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
  const base = await startOfTicket(place, taskTip, head, context);
  if (head === base) return;
  const tree = await commitOf(place.path, 'HEAD^{tree}', context);
  // The squashed commit is made aside and the branch moves to it in one step, so a stop leaves no half-made squash.
  const squashed =
    tree === (await commitOf(place.path, `${base}^{tree}`, context))
      ? base
      : await commitTree(place.path, tree, base, message, context);
  await gitOutput(place.path, ['reset', '--quiet', '--soft', squashed], context.runGit);
  if (squashed === base || base === taskTip) return;
  await startRebase(place, taskBranch, ['--onto', taskTip, base], MERGE_AGAIN, context);
  await setForkPoint(place.path, place.branch, taskTip, context);
};

/**
 * Returns the id of a new commit of the tree `tree` with the parent `parent` and the message `message`, cleaned up as
 * `git commit` does, made in the worktree `path` of the repository of `context`. No branch moves.
 * If git fails, rejects with the error of `gitFailure`.
 */
const commitTree = async (
  path: string,
  tree: string,
  parent: string,
  message: string,
  context: WorktreesContext,
): Promise<string> => {
  const commandLine = [...NO_HOOKS, 'commit-tree', tree, '-p', parent, '-F', '-'];
  const output = await context.runGit(path, commandLine, cleanMessage(message));
  if (output.exitCode !== 0) throw gitFailure(path, commandLine, output);
  return output.stdout.trim();
};

/**
 * Returns the message `message` as `git commit` cleans it up: without trailing spaces, leading and trailing blank
 * lines, and runs of blank lines, and ending with one line break.
 */
const cleanMessage = (message: string): string =>
  `${message
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;

/**
 * Records the commit `landed` of the ticket, which is on the task branch, as the fork point of the branch of `place`
 * when the branch is at that commit, as the end of a merge does. A ticket whose worktree is gone, or whose branch moved
 * on, records nothing.
 */
const finishLanded = async (place: WorktreePlace, landed: string, context: WorktreesContext): Promise<void> => {
  if (!(await context.fileSystem.exists(place.path))) return;
  const head = await context.runGit(place.path, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (head.exitCode === 0 && head.stdout.trim() === landed)
    await setForkPoint(place.path, place.branch, landed, context);
};

/**
 * Returns the commit where the commits of the ticket start on the branch of `place`, at the commit `head`: the later
 * of its fork point and its merge base with the tip `taskTip` of the task branch. A merge that stopped after the rebase
 * onto the task branch left a fork point older than the merge base, which would take the commits of other tickets into
 * the squash. A fork point that is no ancestor of the merge base, after a sync rewrote the task branch, wins. A branch
 * without a fork point, or one that does not hold its fork point, starts at the merge base.
 */
const startOfTicket = async (
  place: WorktreePlace,
  taskTip: string,
  head: string,
  context: WorktreesContext,
): Promise<string> => {
  const mergeBase = await gitOutput(place.path, ['merge-base', taskTip, head], context.runGit);
  const forkPoint = await forkPointOf(place.path, place.branch, context);
  if (forkPoint === undefined || !(await isAncestor(place.path, forkPoint, head, context))) return mergeBase;
  return (await isAncestor(place.path, forkPoint, mergeBase, context)) ? mergeBase : forkPoint;
};
