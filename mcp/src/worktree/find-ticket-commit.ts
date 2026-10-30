import { branchExists } from './branches.ts';
import { TASK_TRAILER, TICKET_TRAILER } from './merge-ticket.ts';
import { gitFailure, gitOutput } from './run-git.ts';
import { branchRef, taskBranchOf } from './worktree-layout.ts';
import type { TicketCommit, WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Returns the commit that holds the landed work of the ticket `ticket` of the task `task` in the repository of
 * `context`, with its patch: the latest commit whose trailers name both, on the task branch while it exists, else on
 * the base branch `baseBranch`. If neither branch exists, or neither holds such a commit, returns `undefined` instead.
 * If git fails to find or to show the commit, rejects with the error of `gitFailure`.
 */
export const findTicketCommit = async (
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
  context: WorktreesContext,
): Promise<TicketCommit | undefined> => {
  const { checkout } = context.layout;
  const taskBranch = taskBranchOf(task);
  const branch = (await branchExists(taskBranch, context)) ? taskBranch : baseBranch;
  if (branch === null || !(await branchExists(branch, context))) return undefined;
  const search = [
    'log',
    '-1',
    '--format=%H',
    '--all-match',
    // Each pattern matches a whole line, so ticket 1 does not match the trailer of ticket 11. A slug holds no
    // character that a regular expression reads as special.
    `--grep=^${TASK_TRAILER}: ${task.id}-${task.slug}$`,
    `--grep=^${TICKET_TRAILER}: ${ticket.id}-${ticket.slug}$`,
    branchRef(branch),
  ];
  const commit = await gitOutput(checkout, search, context.runGit);
  if (commit === '') return undefined;
  const show = ['-c', 'core.quotePath=false', 'show', '--format=', '--no-color', '--no-ext-diff', '-M', commit];
  const output = await context.runGit(checkout, show);
  if (output.exitCode !== 0) throw gitFailure(checkout, show, output);
  return { commit, patch: output.stdout };
};
