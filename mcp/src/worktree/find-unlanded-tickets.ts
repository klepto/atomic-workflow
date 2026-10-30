import { branchExists } from './branches.ts';
import { TASK_TRAILER, TICKET_TRAILER } from './merge-ticket.ts';
import { gitOutput } from './run-git.ts';
import { branchRef, taskBranchOf } from './worktree-layout.ts';
import type { WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Pattern of the value of a ticket trailer, `<id>-<slug>`, whose first group is the id of the ticket.
 */
const TICKET_NAME = /^(\d+)-/;

/**
 * Returns the ids of the tickets of the task `task` in the repository of `context` whose landed commits the task
 * branch holds and the base branch `baseBranch` lacks, in ascending order: the tickets whose commits the trailers
 * name. When `baseBranch` is `null` or does not exist, every commit of the task on the task branch counts. Without a
 * task branch, returns an empty array.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const findUnlandedTickets = async (
  task: WorkName,
  baseBranch: string | null,
  context: WorktreesContext,
): Promise<readonly number[]> => {
  const taskBranch = taskBranchOf(task);
  if (!(await branchExists(taskBranch, context))) return [];
  const hasBase = baseBranch !== null && (await branchExists(baseBranch, context));
  const search = [
    'log',
    `--format=%(trailers:key=${TICKET_TRAILER},valueonly)`,
    // The pattern matches a whole line, so task 1 does not match the trailer of task 11.
    `--grep=^${TASK_TRAILER}: ${task.id}-${task.slug}$`,
    branchRef(taskBranch),
    ...(hasBase ? [`^${branchRef(baseBranch)}`] : []),
  ];
  const stdout = await gitOutput(context.layout.checkout, search, context.runGit);
  const ids = new Set<number>();
  for (const line of stdout.split('\n')) {
    const match = TICKET_NAME.exec(line.trim());
    if (match !== null) ids.add(Number(match[1]));
  }
  return [...ids].sort((left, right) => left - right);
};
