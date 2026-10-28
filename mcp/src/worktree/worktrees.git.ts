import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { CopyFailures } from './copy-ignored.ts';
import type { StopProcessesFunction } from './stop-processes.ts';
import { WorktreeError } from './worktree-error.ts';
import type {
  CreateWorktreesFunction,
  CreatedWorktrees,
  DeletedWorktrees,
  MergedTask,
  MergedTicket,
  WorkName,
  WorktreePlace,
  WorktreesDependencies,
} from './worktrees.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Start of the name of every branch of a task.
 */
const BRANCH_PREFIX = 'atomic-workflow/';

/**
 * Last part of the name of a task branch, and name of the directory of its worktree.
 */
const TASK_BRANCH_NAME = 'main';

/**
 * Start of the name of the reference that holds the fork point of a ticket branch. The name of the branch without
 * `BRANCH_PREFIX` ends it.
 */
const FORK_POINT_PREFIX = 'refs/atomic-workflow/fork-points/';

/**
 * Start of the name of the reference of a branch.
 */
const BRANCH_REF_PREFIX = 'refs/heads/';

/**
 * What a conflict of `merge` or `mergeTask` asks the caller to do once the files are resolved.
 */
const MERGE_AGAIN = 'merge again';

/**
 * What a conflict of the sync of `create` asks the caller to do once the files are resolved.
 */
const CREATE_AGAIN = 'create the worktree of the ticket again';

/**
 * Path, relative to the home of the user, of the directory that holds the directory of each repository.
 */
const WORKTREES_DIRECTORY = join('.atomic-workflow', 'worktrees');

/**
 * Number of the hex digits of the key that tells the directories of two repositories with the same name apart.
 */
const REPOSITORY_KEY_LENGTH = 8;

/**
 * Options of each git command that commits or rebases, so no hook of the repository runs for the work of the server.
 */
const NO_HOOKS: readonly string[] = ['-c', 'core.hooksPath=/dev/null'];

/**
 * Options of each rebase that starts, so the settings of the user change no rebase.
 */
const REBASE_OPTIONS: readonly string[] = ['--no-autosquash', '--no-autostash', '--no-update-refs'];

/**
 * Number of the last lines of git that a refusal quotes.
 */
const QUOTED_LINE_COUNT = 5;

/**
 * Number of the failures that `CopyFailures` names.
 */
const NAMED_FAILURE_COUNT = 10;

/**
 * Number of the retries of the deletion of a directory that another program holds.
 */
const REMOVAL_RETRY_COUNT = 10;

/**
 * Time between two retries of the deletion of a directory, in ms.
 */
const REMOVAL_RETRY_INTERVAL = 200;

/**
 * Number of the characters of the command line of a stopped process that its line in `DeletedWorktrees` shows.
 */
const SHOWN_COMMAND_LINE_LENGTH = 160;

/**
 * Start of the line that names the path of a worktree in the list of worktrees that git prints for scripts.
 */
const WORKTREE_LINE = 'worktree ';

/**
 * Start of the line that names the branch of a worktree in the list of worktrees that git prints for scripts.
 */
const BRANCH_LINE = 'branch refs/heads/';

/**
 * Output of a git command that ran to its end.
 */
interface GitOutput {
  /**
   * Exit code of git.
   */
  readonly exitCode: number;

  /**
   * Standard output of git.
   */
  readonly stdout: string;

  /**
   * Standard error of git.
   */
  readonly stderr: string;
}

/**
 * Sync of a task branch with its base branch.
 */
interface TaskBranchSync {
  /**
   * Whether the task branch moved onto the tip of the base branch.
   */
  readonly synced: boolean;

  /**
   * One sentence for each cause that kept the task branch where it is.
   */
  readonly warnings: readonly string[];
}

/**
 * Sync that moved the task branch onto the tip of the base branch.
 */
const SYNCED: TaskBranchSync = { synced: true, warnings: [] };

/**
 * Sync that left the task branch as it is, with no warning.
 */
const NOT_SYNCED: TaskBranchSync = { synced: false, warnings: [] };

/**
 * Rebase that stopped in a worktree.
 */
interface StoppedRebase {
  /**
   * Name of the branch that the rebase rewrites, without `refs/heads/`, or `undefined` for a rebase of a detached
   * `HEAD`.
   */
  readonly branch: string | undefined;

  /**
   * Commit that the rebase puts the commits onto.
   */
  readonly onto: string;
}

/**
 * Places of the worktrees of one repository.
 */
interface Layout {
  /**
   * Absolute path of the main checkout, which git lists first among the worktrees.
   */
  readonly checkout: string;

  /**
   * Absolute path of the directory that holds the directory of each task of the repository.
   */
  readonly root: string;
}

/**
 * Worktree that git knows.
 */
interface ListedWorktree {
  /**
   * Absolute path of the worktree.
   */
  readonly path: string;

  /**
   * Name of the branch that the worktree has checked out, without `refs/heads/`, or `undefined` when it has none
   * checked out.
   */
  readonly branch: string | undefined;
}

/**
 * `CreateWorktreesFunction` that runs git in the main checkout, and keeps the worktrees of the repository in the
 * directory `.atomic-workflow/worktrees/<name of the main checkout>-<hash of its path>/` of the home of the user:
 * `<task id>-<task slug>/main` for a task, and `<task id>-<task slug>/<ticket id>-<ticket slug>` for a ticket. The fork
 * point of each ticket branch is the reference `refs/atomic-workflow/fork-points/<task id>-<task slug>/<ticket
 * id>-<ticket slug>`, which goes away with the branch.
 */
export const gitCreateWorktrees: CreateWorktreesFunction = (dependencies) => {
  const queue = createQueue();
  return {
    create: (task, ticket, baseBranch) => queue(() => create(dependencies, task, ticket, baseBranch)),
    merge: (task, ticket, message) => queue(() => merge(dependencies, task, ticket, message)),
    mergeTask: (task, baseBranch) => queue(() => mergeTask(dependencies, task, baseBranch)),
    deleteTicket: (task, ticket, force) => queue(() => deleteTicket(dependencies, task, ticket, force)),
    deleteTask: (task, baseBranch, force) => queue(() => deleteTask(dependencies, task, baseBranch, force)),
  };
};

/**
 * Runs an operation once every operation that came before it has ended, and returns its value.
 */
type Queue = <Value>(operation: () => Promise<Value>) => Promise<Value>;

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

/**
 * Returns the places of the worktrees of the repository of `dependencies`.
 */
const layoutOf = async ({ directory, home }: WorktreesDependencies): Promise<Layout> => {
  const checkout = await mainCheckout(directory);
  return { checkout, root: join(home, WORKTREES_DIRECTORY, `${basename(checkout)}-${repositoryKey(checkout)}`) };
};

/**
 * Returns the absolute path of the main checkout of the repository that holds `directory`.
 */
const mainCheckout = async (directory: string): Promise<string> => {
  const [first] = await listWorktrees(directory);
  if (first === undefined) throw new Error(`Git listed no worktree for ${directory}`);
  return first.path;
};

/**
 * Returns a short hash of the path `checkout`. Paths that differ only in their separators, or on Windows only in their
 * case, give the same hash.
 */
const repositoryKey = (checkout: string): string => {
  const normalized = resolve(checkout);
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  return createHash('sha256').update(key).digest('hex').slice(0, REPOSITORY_KEY_LENGTH);
};

/**
 * Returns the name of the directory of the task `task`, which also starts the names of its branches.
 */
const taskName = (task: WorkName): string => `${task.id}-${task.slug}`;

/**
 * Returns the directory of the task `task` in `layout`, which holds the worktrees of the task.
 */
const taskDirectory = (layout: Layout, task: WorkName): string => join(layout.root, taskName(task));

/**
 * Returns the name of the task branch of the task `task`.
 */
const taskBranchOf = (task: WorkName): string => `${BRANCH_PREFIX}${taskName(task)}/${TASK_BRANCH_NAME}`;

/**
 * Returns the worktree and the branch of the task `task` in `layout`.
 */
const taskPlaceOf = (layout: Layout, task: WorkName): WorktreePlace => ({
  path: join(taskDirectory(layout, task), TASK_BRANCH_NAME),
  branch: taskBranchOf(task),
});

/**
 * Returns the worktree and the branch of the ticket `ticket` of the task `task` in `layout`.
 */
const ticketPlaceOf = (layout: Layout, task: WorkName, ticket: WorkName): WorktreePlace => ({
  path: join(taskDirectory(layout, task), `${ticket.id}-${ticket.slug}`),
  branch: `${BRANCH_PREFIX}${taskName(task)}/${ticket.id}-${ticket.slug}`,
});

/**
 * Returns `place` with its path in forward slashes.
 */
const shown = (place: WorktreePlace): WorktreePlace => ({ ...place, path: forwardSlashes(place.path) });

/**
 * Returns `path` with forward slashes.
 */
const forwardSlashes = (path: string): string => path.replaceAll('\\', '/');

/**
 * Returns the worktrees of the task `task` and of its ticket `ticket`, made where they do not exist. Before it makes
 * the ticket branch, it syncs the task branch with the base branch as `syncTaskBranch` says.
 */
const create = async (
  dependencies: WorktreesDependencies,
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
): Promise<CreatedWorktrees> => {
  const layout = await layoutOf(dependencies);
  const taskPlace = taskPlaceOf(layout, task);
  const ticketPlace = ticketPlaceOf(layout, task, ticket);
  const base = baseBranch ?? (await checkedOutBranch(layout.checkout));
  const taskBranchCreated = !(await branchExists(layout.checkout, taskPlace.branch));
  const uncommittedChanges = taskBranchCreated && (await changes(layout.checkout, false)).length > 0;
  if (taskBranchCreated) await makeBranch(layout.checkout, taskPlace.branch, base);
  await gitOutput(layout.checkout, ['worktree', 'prune']);
  const taskFailures = await ensureWorktree(dependencies, layout, taskPlace, true);
  const ticketBranchCreated = !(await branchExists(layout.checkout, ticketPlace.branch));
  const sync = await syncTaskBranch(dependencies, layout, task, base, ticketBranchCreated);
  if (ticketBranchCreated) await makeTicketBranch(layout.checkout, ticketPlace.branch, taskPlace.branch);
  const ticketFailures = await ensureWorktree(dependencies, layout, ticketPlace, true);
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
 * Returns the name of the branch that the main checkout `checkout` has checked out.
 * If it has none checked out, rejects with `not-allowed`.
 */
const checkedOutBranch = async (checkout: string): Promise<string> => {
  const output = await runGit(checkout, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (output.exitCode === 0) return output.stdout.trim();
  throw new WorktreeError(
    'not-allowed',
    `The main checkout ${forwardSlashes(checkout)} has no branch checked out, so the task branch has no base. Check out the branch to base the task on, then try again`,
  );
};

/**
 * Makes the branch `branch` at `start` in the repository of `checkout`.
 * If git refuses, rejects with `not-allowed`.
 */
const makeBranch = async (checkout: string, branch: string, start: string): Promise<void> => {
  const output = await runGit(checkout, ['branch', '--no-track', branch, start]);
  if (output.exitCode === 0) return;
  throw new WorktreeError('not-allowed', `Git refused to make the branch ${branch} at ${start}: ${lastLines(output)}`);
};

/**
 * Makes the ticket branch `branch` at the tip of the task branch `taskBranch` in the repository of `checkout`, and
 * records that tip as its fork point.
 * If git refuses to make the branch, rejects with `not-allowed`.
 */
const makeTicketBranch = async (checkout: string, branch: string, taskBranch: string): Promise<void> => {
  const taskTip = await gitOutput(checkout, ['rev-parse', `refs/heads/${taskBranch}`]);
  await makeBranch(checkout, branch, taskTip);
  await setForkPoint(checkout, branch, taskTip);
};

/**
 * Syncs the task branch of the task `task` in `layout` with the base branch `baseBranch`, in the worktree of the task,
 * and returns whether it moved, with a warning for each cause that kept it where it is. A sync that stopped continues
 * as `resumeSync` says. Else, only with `start`, a new sync starts: a task branch that holds the tip of the base branch
 * stays as it is, one that the base branch holds moves forward to it, and any other is rebased onto it. A new sync is
 * skipped, with a warning, when the base branch does not exist, the worktree of the task has changes that no commit
 * holds, or a ticket branch of the task has no fork point, since the rebase would break its squash.
 * If the rebase stops, rejects as `checkRebaseEnded` does, and leaves it stopped in the worktree of the task.
 */
const syncTaskBranch = async (
  dependencies: WorktreesDependencies,
  layout: Layout,
  task: WorkName,
  baseBranch: string,
  start: boolean,
): Promise<TaskBranchSync> => {
  const place = taskPlaceOf(layout, task);
  const rebase = await stoppedRebase(place.path);
  if (rebase !== undefined) return resumeSync(layout, place, baseBranch, rebase, start);
  if (!start) return NOT_SYNCED;
  if (!(await branchExists(layout.checkout, baseBranch)))
    return skippedSync(`The base branch ${baseBranch} does not exist`, baseBranch);
  const baseRef = `refs/heads/${baseBranch}`;
  const taskRef = `refs/heads/${place.branch}`;
  if (await isAncestor(layout.checkout, baseRef, taskRef)) return NOT_SYNCED;
  const cause = await syncBlocker(layout, task, place);
  if (cause !== undefined) return skippedSync(cause, baseBranch);
  if (!(await isAncestor(layout.checkout, taskRef, baseRef))) {
    await rebaseOnto(dependencies, layout, place, baseBranch, CREATE_AGAIN);
    return SYNCED;
  }
  const taskTip = await gitOutput(layout.checkout, ['rev-parse', taskRef]);
  await forwardBranch(layout, place.branch, taskTip, await gitOutput(layout.checkout, ['rev-parse', baseRef]));
  return SYNCED;
};

/**
 * Returns the sync that the cause `cause` skipped, which left the task branch behind the base branch `baseBranch`.
 */
const skippedSync = (cause: string, baseBranch: string): TaskBranchSync => ({
  synced: false,
  warnings: [`${cause}, so the task branch was not synced with ${baseBranch}`],
});

/**
 * Continues the stopped rebase `rebase` in the worktree of the task branch of `place` in `layout`, a sync with the base
 * branch `baseBranch`, once every conflicting file is resolved and added, and returns the sync that it ends. Without
 * `start`, a rebase that is no sync stays as it is, and so does a sync whose files still conflict, with a warning.
 * With `start`, if `rebase` does not rebase the task branch onto a commit of the base branch, rejects with
 * `not-allowed`, and if a file still conflicts or the rebase stops again, rejects as `checkRebaseEnded` does.
 */
const resumeSync = async (
  layout: Layout,
  place: WorktreePlace,
  baseBranch: string,
  rebase: StoppedRebase,
  start: boolean,
): Promise<TaskBranchSync> => {
  const sync =
    rebase.branch === place.branch && (await isAncestor(layout.checkout, rebase.onto, `refs/heads/${baseBranch}`));
  if (!sync && !start) return NOT_SYNCED;
  if (!sync) {
    throw new WorktreeError(
      'not-allowed',
      `The worktree ${forwardSlashes(place.path)} of the task branch has a stopped rebase that is no sync of ${place.branch} with ${baseBranch}. Finish or abort it there, then try again`,
    );
  }
  const files = await conflictFiles(place.path);
  if (!start && files.length > 0)
    return skippedSync(
      `The sync in ${forwardSlashes(place.path)} stopped on a conflict in ${files.join(', ')}`,
      baseBranch,
    );
  await continueRebase(place, baseBranch, CREATE_AGAIN);
  return SYNCED;
};

/**
 * Returns the cause that keeps the task branch of `place` of the task `task` in `layout` from a sync, or `undefined`
 * when nothing does: changes of the worktree of the task that no commit holds, or ticket branches without a fork point.
 */
const syncBlocker = async (layout: Layout, task: WorkName, place: WorktreePlace): Promise<string | undefined> => {
  if ((await changes(place.path, true)).length > 0)
    return `The worktree ${forwardSlashes(place.path)} of the task branch has changes that no commit holds`;
  const unforked: string[] = [];
  for (const branch of await taskBranches(layout.checkout, task)) {
    if (branch !== place.branch && (await forkPointOf(layout.checkout, branch)) === undefined) unforked.push(branch);
  }
  if (unforked.length === 0) return undefined;
  return `The ticket branches ${unforked.join(', ')} have no fork point, since they were made before fork points were recorded, and a rebase of the task branch would break their squash`;
};

/**
 * Makes the worktree of `place` in `layout`, with `copy` a copy of the ignored files of the main checkout, unless it
 * exists, and returns the files that could not be copied. If the worktree exists, nothing was copied, or every copy
 * succeeded, returns `undefined` instead. A worktree whose stopped rebase rewrites the branch of `place`, and so
 * detaches it from the branch, counts as a worktree of the branch.
 * If the path of `place` holds a worktree of another branch, the branch of `place` is checked out in another
 * worktree, or git refuses to make the worktree, rejects with `not-allowed`.
 */
const ensureWorktree = async (
  dependencies: WorktreesDependencies,
  layout: Layout,
  place: WorktreePlace,
  copy: boolean,
): Promise<CopyFailures | undefined> => {
  const listed = await listWorktrees(layout.checkout);
  const existing = listed.find((worktree) => samePath(worktree.path, place.path));
  if (existing !== undefined) {
    if ((existing.branch ?? (await stoppedRebase(place.path))?.branch) === place.branch) return undefined;
    throw new WorktreeError(
      'not-allowed',
      `The worktree ${forwardSlashes(place.path)} has ${existing.branch ?? 'no branch'} checked out in place of ${place.branch}. Check out ${place.branch} there, then try again`,
    );
  }
  const holder = listed.find((worktree) => worktree.branch === place.branch);
  if (holder !== undefined) {
    throw new WorktreeError(
      'not-allowed',
      `The branch ${place.branch} is checked out in ${forwardSlashes(holder.path)}. Check out another branch there, then try again`,
    );
  }
  await mkdir(dirname(place.path), { recursive: true });
  const output = await runGit(layout.checkout, ['worktree', 'add', '--quiet', place.path, place.branch]);
  if (output.exitCode !== 0) {
    throw new WorktreeError(
      'not-allowed',
      `Git refused to make the worktree ${forwardSlashes(place.path)} of ${place.branch}: ${lastLines(output)}`,
    );
  }
  return copy ? dependencies.copyIgnored(layout.checkout, place.path) : undefined;
};

/**
 * Returns the failures of `first` and `second` together, or `null` when neither has any.
 */
const joinFailures = (first: CopyFailures | undefined, second: CopyFailures | undefined): CopyFailures | null => {
  if (first === undefined) return second ?? null;
  if (second === undefined) return first;
  return { count: first.count + second.count, first: [...first.first, ...second.first].slice(0, NAMED_FAILURE_COUNT) };
};

/**
 * Returns the work of the ticket `ticket` of the task `task` after it landed on the task branch as one commit with the
 * message `message`.
 */
const merge = async (
  dependencies: WorktreesDependencies,
  task: WorkName,
  ticket: WorkName,
  message: string,
): Promise<MergedTicket> => {
  const layout = await layoutOf(dependencies);
  const taskPlace = taskPlaceOf(layout, task);
  const place = ticketPlaceOf(layout, task, ticket);
  await checkListed(layout, place);
  await checkNotRebasing(taskPlace);
  const rebase = await stoppedRebase(place.path);
  if (rebase === undefined) await squashOnto(place, taskPlace.branch, message);
  else {
    await continueRebase(place, taskPlace.branch, MERGE_AGAIN);
    await setForkPoint(place.path, place.branch, rebase.onto);
  }
  const commit = await land(layout, taskPlace.branch, place);
  // The task branch holds the whole ticket branch now, so a later commit of the ticket starts from its tip.
  await setForkPoint(place.path, place.branch, await gitOutput(place.path, ['rev-parse', 'HEAD']));
  return { taskBranch: taskPlace.branch, commit };
};

/**
 * Rejects with `not-allowed` when git knows no worktree of the branch of `place` at its path. A worktree at the path
 * with no branch checked out counts while it has a stopped rebase, which detaches it from its branch.
 */
const checkListed = async (layout: Layout, place: WorktreePlace): Promise<void> => {
  const listed = (await listWorktrees(layout.checkout)).find((worktree) => samePath(worktree.path, place.path));
  if (listed?.branch === place.branch) return;
  if (listed !== undefined && listed.branch === undefined && (await isRebasing(place.path))) return;
  throw new WorktreeError(
    'not-allowed',
    `No worktree of ${place.branch} exists at ${forwardSlashes(place.path)}. Create the worktree of the ticket first`,
  );
};

/**
 * Rejects with `not-allowed` when the worktree of the task branch of `place` has a stopped rebase, which detaches it
 * from the task branch, so the task branch cannot move.
 */
const checkNotRebasing = async (place: WorktreePlace): Promise<void> => {
  if (!(await exists(place.path)) || !(await isRebasing(place.path))) return;
  throw new WorktreeError(
    'not-allowed',
    `The worktree ${forwardSlashes(place.path)} of the task branch ${place.branch} has a stopped rebase, so the task branch cannot move. Resolve the conflicting files there, run git add on them there, and create the worktree of a ticket again, which ends the rebase. Then merge again`,
  );
};

/**
 * Turns the commits of the branch of `place` since it left the task branch `taskBranch` into one commit with the
 * message `message`, and rebases it onto the tip of the task branch, which becomes its fork point. A branch with no
 * commit of its own stays as it is, and so does a branch whose commits change nothing.
 * If the worktree of `place` has changes that no commit holds, rejects with `not-allowed`. If the rebase stops,
 * rejects as `checkRebaseEnded` does.
 */
const squashOnto = async (place: WorktreePlace, taskBranch: string, message: string): Promise<void> => {
  await checkClean(place.path);
  const taskTip = await gitOutput(place.path, ['rev-parse', `refs/heads/${taskBranch}`]);
  const head = await gitOutput(place.path, ['rev-parse', 'HEAD']);
  const base = await forkPointOrMergeBase(place, taskTip, head);
  if (head === base) return;
  await gitOutput(place.path, ['reset', '--quiet', '--soft', base]);
  if (!(await hasStagedChanges(place.path))) return;
  await gitOutput(place.path, [...NO_HOOKS, 'commit', '--quiet', '--no-verify', '-m', message]);
  if (base === taskTip) return;
  const output = await runGit(place.path, [...NO_HOOKS, 'rebase', ...REBASE_OPTIONS, '--onto', taskTip, base]);
  await checkRebaseEnded(place, taskBranch, output, MERGE_AGAIN);
  await setForkPoint(place.path, place.branch, taskTip);
};

/**
 * Returns the commit where the branch of `place`, at the commit `head`, left the task branch: its fork point. For a
 * branch without a fork point, or one that does not hold its fork point, returns the merge base of `head` and the tip
 * `taskTip` of the task branch instead.
 */
const forkPointOrMergeBase = async (place: WorktreePlace, taskTip: string, head: string): Promise<string> => {
  const forkPoint = await forkPointOf(place.path, place.branch);
  if (forkPoint !== undefined && (await isAncestor(place.path, forkPoint, head))) return forkPoint;
  return gitOutput(place.path, ['merge-base', taskTip, head]);
};

/**
 * Rejects with `not-allowed` when the worktree `path` has changes that no commit holds: changes of tracked files, and
 * files that are neither tracked nor ignored.
 */
const checkClean = async (path: string): Promise<void> => {
  const lines = await changes(path, true);
  if (lines.length === 0) return;
  throw new WorktreeError(
    'not-allowed',
    `The worktree ${forwardSlashes(path)} has changes that no commit holds: ${lines.slice(0, QUOTED_LINE_COUNT).join(', ')}. Commit or discard them, then try again`,
  );
};

/**
 * Returns one line of `git status --porcelain` per changed file of the worktree `path`: changes of tracked files, and
 * with `untracked`, files that are neither tracked nor ignored.
 */
const changes = async (path: string, untracked: boolean): Promise<string[]> => {
  const option = untracked ? '--untracked-files=all' : '--untracked-files=no';
  const stdout = await gitOutput(path, ['status', '--porcelain', option]);
  return stdout.split('\n').filter((line) => line.trim() !== '');
};

/**
 * Returns whether the index of the worktree `path` differs from its `HEAD`.
 */
const hasStagedChanges = async (path: string): Promise<boolean> => {
  const output = await runGit(path, ['diff', '--cached', '--quiet']);
  return output.exitCode !== 0;
};

/**
 * Lets the stopped rebase of the worktree of `place` onto the branch `target` go on once every conflicting file is
 * resolved and added. If it stops again, or a file still conflicts, rejects as `checkRebaseEnded` does, with `retry`.
 */
const continueRebase = async (place: WorktreePlace, target: string, retry: string): Promise<void> => {
  const files = await conflictFiles(place.path);
  if (files.length > 0) throw conflict(place, target, files, retry);
  const output = await runGit(place.path, [...NO_HOOKS, 'rebase', '--continue']);
  await checkRebaseEnded(place, target, output, retry);
};

/**
 * Rejects when the rebase onto the branch `target` in the worktree of `place`, which printed `output`, stopped: with
 * `conflict` when files conflict, which asks the caller to `retry` once they are resolved, else with `not-allowed`. A
 * rebase that failed without a stop rejects with an error.
 */
const checkRebaseEnded = async (
  place: WorktreePlace,
  target: string,
  output: GitOutput,
  retry: string,
): Promise<void> => {
  if (await isRebasing(place.path)) {
    const files = await conflictFiles(place.path);
    if (files.length > 0) throw conflict(place, target, files, retry);
    throw new WorktreeError(
      'not-allowed',
      `Git stopped the rebase onto ${target} in ${forwardSlashes(place.path)}: ${lastLines(output)}. Run git status there to see what the rebase waits for`,
    );
  }
  if (output.exitCode !== 0) throw new Error(`Git rebase failed in ${place.path}: ${lastLines(output)}`);
};

/**
 * Returns the `conflict` of the rebase onto the branch `target` in the worktree of `place` on the files `files`, which
 * asks the caller to `retry` once they are resolved.
 */
const conflict = (place: WorktreePlace, target: string, files: readonly string[], retry: string): WorktreeError =>
  new WorktreeError(
    'conflict',
    `The rebase of ${place.branch} onto ${target} stopped on a conflict in ${files.join(', ')}. Resolve the files in ${forwardSlashes(place.path)}, run git add on them there, then ${retry}`,
    files,
  );

/**
 * Returns whether the worktree `path` has a stopped rebase.
 */
const isRebasing = async (path: string): Promise<boolean> => (await rebaseDirectory(path)) !== undefined;

/**
 * Returns the stopped rebase of the worktree `path`, or `undefined` when it has none.
 */
const stoppedRebase = async (path: string): Promise<StoppedRebase | undefined> => {
  const directory = await rebaseDirectory(path);
  if (directory === undefined) return undefined;
  const headName = (await readFile(join(directory, 'head-name'), 'utf8')).trim();
  const onto = (await readFile(join(directory, 'onto'), 'utf8')).trim();
  const branch = headName.startsWith(BRANCH_REF_PREFIX) ? headName.slice(BRANCH_REF_PREFIX.length) : undefined;
  return { branch, onto };
};

/**
 * Returns the absolute path of the directory where git keeps the stopped rebase of the worktree `path`, or `undefined`
 * when it has none.
 */
const rebaseDirectory = async (path: string): Promise<string | undefined> => {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const directory = await gitOutput(path, ['rev-parse', '--path-format=absolute', '--git-path', name]);
    if (await exists(directory)) return directory;
  }
  return undefined;
};

/**
 * Returns the paths of the files in conflict in the worktree `path`.
 */
const conflictFiles = async (path: string): Promise<string[]> => {
  const stdout = await gitOutput(path, ['diff', '--name-only', '--diff-filter=U']);
  return stdout.split('\n').filter((line) => line !== '');
};

/**
 * Moves the branch `target` forward to the tip of the branch of `place` in `layout`, and returns the tip. A branch of
 * `place` that `target` holds already lands nothing, and returns `null`.
 * If the branch of `place` does not hold the tip of `target`, or `target` cannot move, rejects with `not-allowed`.
 */
const land = async (layout: Layout, target: string, place: WorktreePlace): Promise<string | null> => {
  const targetTip = await gitOutput(layout.checkout, ['rev-parse', `refs/heads/${target}`]);
  const tip = await gitOutput(layout.checkout, ['rev-parse', `refs/heads/${place.branch}`]);
  if (await isAncestor(layout.checkout, tip, targetTip)) return null;
  if (!(await isAncestor(layout.checkout, targetTip, tip))) {
    throw new WorktreeError(
      'not-allowed',
      `The branch ${place.branch} does not hold the tip of ${target}, so ${target} cannot move to it. Merge again`,
    );
  }
  await forwardBranch(layout, target, targetTip, tip);
  return tip;
};

/**
 * Moves the branch `branch` forward from `oldCommit` to `newCommit`: in the worktree that has it checked out, so its
 * files follow, or as a plain reference when no worktree has it checked out.
 * If git refuses, such as for changes of the worktree that the move would overwrite, rejects with `not-allowed`.
 */
const forwardBranch = async (layout: Layout, branch: string, oldCommit: string, newCommit: string): Promise<void> => {
  const holder = (await listWorktrees(layout.checkout)).find((worktree) => worktree.branch === branch);
  const output =
    holder === undefined
      ? await runGit(layout.checkout, ['update-ref', `refs/heads/${branch}`, newCommit, oldCommit])
      : await runGit(holder.path, ['merge', '--ff-only', '--quiet', newCommit]);
  if (output.exitCode === 0) return;
  throw new WorktreeError(
    'not-allowed',
    `Git refused to move ${branch} forward to ${newCommit}: ${lastLines(output)}. Remove the cause, then merge again`,
  );
};

/**
 * Returns the work of the task `task` after its task branch landed on the base branch `baseBranch`, and every
 * worktree and branch of the task was removed.
 */
const mergeTask = async (
  dependencies: WorktreesDependencies,
  task: WorkName,
  baseBranch: string,
): Promise<MergedTask> => {
  const layout = await layoutOf(dependencies);
  const place = taskPlaceOf(layout, task);
  for (const branch of [place.branch, baseBranch]) await checkBranchExists(layout.checkout, branch);
  const branches = await taskBranches(layout.checkout, task);
  await checkLanded(
    layout.checkout,
    branches.filter((branch) => branch !== place.branch),
    place.branch,
  );
  const worktrees = await taskWorktrees(layout, task, branches);
  const rebasing =
    worktrees.some((worktree) => samePath(worktree.path, place.path) && worktree.branch === undefined) &&
    (await isRebasing(place.path));
  for (const worktree of worktrees) {
    if (!rebasing || !samePath(worktree.path, place.path)) await checkClean(worktree.path);
  }
  if (rebasing) await continueRebase(place, baseBranch, MERGE_AGAIN);
  else await rebaseOnto(dependencies, layout, place, baseBranch, MERGE_AGAIN);
  const commit = await land(layout, baseBranch, place);
  // The ticket branches held no commit that the task branch lacked before its rebase, so their removal loses nothing.
  const deleted = await remove(
    layout,
    dependencies.stopProcesses,
    await taskWorktrees(layout, task, branches),
    branches,
    [taskDirectory(layout, task)],
  );
  return { baseBranch, commit, deleted };
};

/**
 * Rejects with `not-allowed` when the branch `branch` does not exist in the repository of `checkout`.
 */
const checkBranchExists = async (checkout: string, branch: string): Promise<void> => {
  if (await branchExists(checkout, branch)) return;
  throw new WorktreeError('not-allowed', `The branch ${branch} does not exist, so the task branch cannot land`);
};

/**
 * Rebases the task branch of `place` onto the tip of the base branch `baseBranch` in the worktree of `place` in
 * `layout`, made without a copy of the ignored files where it does not exist. A task branch that holds the tip of the
 * base branch, or that the base branch holds, stays as it is.
 * If the rebase stops, rejects as `checkRebaseEnded` does, with `retry`.
 */
const rebaseOnto = async (
  dependencies: WorktreesDependencies,
  layout: Layout,
  place: WorktreePlace,
  baseBranch: string,
  retry: string,
): Promise<void> => {
  const baseRef = `refs/heads/${baseBranch}`;
  const taskRef = `refs/heads/${place.branch}`;
  if (await isAncestor(layout.checkout, baseRef, taskRef)) return;
  if (await isAncestor(layout.checkout, taskRef, baseRef)) return;
  await gitOutput(layout.checkout, ['worktree', 'prune']);
  await ensureWorktree(dependencies, layout, place, false);
  const baseTip = await gitOutput(layout.checkout, ['rev-parse', baseRef]);
  const output = await runGit(place.path, [...NO_HOOKS, 'rebase', ...REBASE_OPTIONS, baseTip]);
  await checkRebaseEnded(place, baseBranch, output, retry);
};

/**
 * Returns what the removal of the worktree and the branch of the ticket `ticket` of the task `task` removed.
 */
const deleteTicket = async (
  dependencies: WorktreesDependencies,
  task: WorkName,
  ticket: WorkName,
  force: boolean,
): Promise<DeletedWorktrees> => {
  const layout = await layoutOf(dependencies);
  const place = ticketPlaceOf(layout, task, ticket);
  const worktrees = (await listWorktrees(layout.checkout)).filter(
    (worktree) => samePath(worktree.path, place.path) || worktree.branch === place.branch,
  );
  const branches = (await branchExists(layout.checkout, place.branch)) ? [place.branch] : [];
  if (!force) {
    await checkLanded(layout.checkout, branches, taskBranchOf(task));
    for (const worktree of worktrees) await checkClean(worktree.path);
  }
  return remove(layout, dependencies.stopProcesses, worktrees, branches, []);
};

/**
 * Returns what the removal of every worktree and branch of the task `task` removed.
 */
const deleteTask = async (
  dependencies: WorktreesDependencies,
  task: WorkName,
  baseBranch: string | null,
  force: boolean,
): Promise<DeletedWorktrees> => {
  const layout = await layoutOf(dependencies);
  const taskBranch = taskBranchOf(task);
  const branches = await taskBranches(layout.checkout, task);
  const worktrees = await taskWorktrees(layout, task, branches);
  if (!force) {
    await checkTaskLanded(layout.checkout, branches, taskBranch, baseBranch);
    await checkLanded(
      layout.checkout,
      branches.filter((branch) => branch !== taskBranch),
      taskBranch,
    );
    for (const worktree of worktrees) await checkClean(worktree.path);
  }
  return remove(layout, dependencies.stopProcesses, worktrees, branches, [taskDirectory(layout, task)]);
};

/**
 * Rejects with `not-allowed` when the task branch `taskBranch`, one of `branches`, holds commits that the base branch
 * `baseBranch` lacks, or the base branch is `null` or does not exist.
 */
const checkTaskLanded = async (
  checkout: string,
  branches: readonly string[],
  taskBranch: string,
  baseBranch: string | null,
): Promise<void> => {
  if (!branches.includes(taskBranch)) return;
  if (baseBranch !== null && (await branchExists(checkout, baseBranch))) {
    await checkLanded(checkout, [taskBranch], baseBranch);
    return;
  }
  throw new WorktreeError(
    'not-allowed',
    `The task branch ${taskBranch} has no base branch to compare it with, so its work may be lost. Delete it with force to delete it anyway`,
  );
};

/**
 * Rejects with `not-allowed` when a branch of `branches` holds commits that the branch `target` lacks, or `target`
 * does not exist while `branches` is not empty.
 */
const checkLanded = async (checkout: string, branches: readonly string[], target: string): Promise<void> => {
  const lacking: string[] = [];
  for (const branch of branches) {
    const landed = await isAncestor(checkout, `refs/heads/${branch}`, `refs/heads/${target}`);
    if (!landed) lacking.push(branch);
  }
  if (lacking.length === 0) return;
  throw new WorktreeError(
    'not-allowed',
    `The branches ${lacking.join(', ')} hold commits that ${target} lacks, so their work would be lost. Merge them first, or delete them with force`,
  );
};

/**
 * Returns the names of every branch of the task `task` in the repository of `checkout`, the task branch included.
 */
const taskBranches = async (checkout: string, task: WorkName): Promise<string[]> => {
  const stdout = await gitOutput(checkout, [
    'for-each-ref',
    '--format=%(refname:short)',
    `refs/heads/${BRANCH_PREFIX}${taskName(task)}/`,
  ]);
  return stdout.split('\n').filter((line) => line !== '');
};

/**
 * Returns every worktree of the task `task` in `layout`: the ones in the directory of the task, and the ones that
 * have one of its branches `branches` checked out.
 */
const taskWorktrees = async (
  layout: Layout,
  task: WorkName,
  branches: readonly string[],
): Promise<ListedWorktree[]> => {
  const directory = taskDirectory(layout, task);
  return (await listWorktrees(layout.checkout)).filter(
    (worktree) => isBelow(directory, worktree.path) || branches.includes(worktree.branch ?? ''),
  );
};

/**
 * Returns whether `path` is the directory `directory` or lies below it.
 */
const isBelow = (directory: string, path: string): boolean => {
  const inside = relative(normalized(directory), normalized(path));
  return !isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`);
};

/**
 * Returns what the removal of the worktrees `worktrees`, the branches `branches` with their fork points, and then the
 * directories `directories` of `layout` removed, with a warning for each one that could not be removed. The processes
 * that run from the worktrees and the directories are stopped with `stopProcesses` first.
 */
const remove = async (
  layout: Layout,
  stopProcesses: StopProcessesFunction,
  worktrees: readonly ListedWorktree[],
  branches: readonly string[],
  directories: readonly string[],
): Promise<DeletedWorktrees> => {
  const { stoppedProcesses, warnings } = await stopHolders(stopProcesses, [
    ...worktrees.map(({ path }) => path),
    ...directories,
  ]);
  const removedWorktrees: string[] = [];
  for (const worktree of worktrees) {
    if (await removeWorktree(layout, worktree.path, warnings)) removedWorktrees.push(forwardSlashes(worktree.path));
  }
  await runGit(layout.checkout, ['worktree', 'prune']);
  const removedBranches: string[] = [];
  for (const branch of branches) {
    if (await removeBranch(layout, branch, warnings)) removedBranches.push(branch);
  }
  for (const directory of directories) await removeDirectory(directory, warnings);
  return { worktrees: removedWorktrees, branches: removedBranches, stoppedProcesses, warnings };
};

/**
 * Stops with `stopProcesses` the processes that run from the paths `paths` that exist, and returns one line for each
 * process that stopped, and one warning for each one that did not. Paths that do not exist stop nothing, and start no
 * search.
 */
const stopHolders = async (
  stopProcesses: StopProcessesFunction,
  paths: readonly string[],
): Promise<{ stoppedProcesses: string[]; warnings: string[] }> => {
  const existing: string[] = [];
  for (const path of paths) if (await exists(path)) existing.push(path);
  if (existing.length === 0) return { stoppedProcesses: [], warnings: [] };
  const { stopped, failures } = await stopProcesses(existing);
  return {
    stoppedProcesses: stopped.map(({ pid, commandLine }) => `${pid} ${shortened(commandLine)}`),
    warnings: [...failures],
  };
};

/**
 * Returns `commandLine` cut to `SHOWN_COMMAND_LINE_LENGTH` characters, with `…` at the end when it was cut.
 */
const shortened = (commandLine: string): string =>
  commandLine.length <= SHOWN_COMMAND_LINE_LENGTH ? commandLine : `${commandLine.slice(0, SHOWN_COMMAND_LINE_LENGTH)}…`;

/**
 * Deletes the branch `branch` of `layout` with its fork point, and returns whether the branch is gone. A failure adds
 * a warning to `warnings`.
 */
const removeBranch = async (layout: Layout, branch: string, warnings: string[]): Promise<boolean> => {
  const output = await runGit(layout.checkout, ['branch', '--quiet', '-D', branch]);
  if (output.exitCode !== 0) {
    warnings.push(`The branch ${branch} could not be deleted: ${lastLines(output)}`);
    return false;
  }
  const forkPoint = await runGit(layout.checkout, ['update-ref', '-d', forkPointRefOf(branch)]);
  if (forkPoint.exitCode !== 0)
    warnings.push(`The fork point of the branch ${branch} could not be deleted: ${lastLines(forkPoint)}`);
  return true;
};

/**
 * Removes the worktree `path` of `layout` with its files, and returns whether it is gone. A directory that git cannot
 * remove, such as one that another program holds for a moment, is deleted with retries. A failure adds a warning to
 * `warnings`.
 */
const removeWorktree = async (layout: Layout, path: string, warnings: string[]): Promise<boolean> => {
  const output = await runGit(layout.checkout, ['worktree', 'remove', '--force', '--force', path]);
  if (output.exitCode === 0 && !(await exists(path))) return true;
  return removeDirectory(path, warnings);
};

/**
 * Deletes the directory `path` with its contents, and returns whether it is gone. A directory that does not exist is
 * gone. A failure adds a warning to `warnings`.
 */
const removeDirectory = async (path: string, warnings: string[]): Promise<boolean> => {
  try {
    await rm(path, {
      recursive: true,
      force: true,
      maxRetries: REMOVAL_RETRY_COUNT,
      retryDelay: REMOVAL_RETRY_INTERVAL,
    });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warnings.push(`The directory ${forwardSlashes(path)} could not be deleted: ${reason}`);
    return false;
  }
};

/**
 * Returns whether the branch `branch` exists in the repository of `directory`.
 */
const branchExists = async (directory: string, branch: string): Promise<boolean> => {
  const output = await runGit(directory, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  return output.exitCode === 0;
};

/**
 * Returns whether the commit `ancestor` is `descendant` or one of its ancestors, in the repository of `directory`. A
 * commit that does not exist is no ancestor.
 */
const isAncestor = async (directory: string, ancestor: string, descendant: string): Promise<boolean> => {
  const output = await runGit(directory, ['merge-base', '--is-ancestor', ancestor, descendant]);
  return output.exitCode === 0;
};

/**
 * Returns the name of the reference that holds the fork point of the ticket branch `branch`.
 */
const forkPointRefOf = (branch: string): string => `${FORK_POINT_PREFIX}${branch.slice(BRANCH_PREFIX.length)}`;

/**
 * Returns the fork point of the ticket branch `branch` in the repository of `directory`: the commit of the task branch
 * that its own commits start from. For a branch without a fork point, such as one made before fork points were
 * recorded, returns `undefined` instead.
 */
const forkPointOf = async (directory: string, branch: string): Promise<string | undefined> => {
  const output = await runGit(directory, ['rev-parse', '--verify', '--quiet', `${forkPointRefOf(branch)}^{commit}`]);
  return output.exitCode === 0 ? output.stdout.trim() : undefined;
};

/**
 * Records the commit `commit` as the fork point of the ticket branch `branch` in the repository of `directory`.
 */
const setForkPoint = async (directory: string, branch: string, commit: string): Promise<void> => {
  await gitOutput(directory, ['update-ref', forkPointRefOf(branch), commit]);
};

/**
 * Returns every worktree of the repository of `directory`, the main checkout first.
 */
const listWorktrees = async (directory: string): Promise<ListedWorktree[]> => {
  const stdout = await gitOutput(directory, ['worktree', 'list', '--porcelain']);
  return stdout
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .filter((lines) => lines[0]?.startsWith(WORKTREE_LINE))
    .map((lines) => ({
      path: resolve(lines[0].slice(WORKTREE_LINE.length)),
      branch: lines.find((line) => line.startsWith(BRANCH_LINE))?.slice(BRANCH_LINE.length),
    }));
};

/**
 * Returns whether `first` and `second` name the same path.
 */
const samePath = (first: string, second: string): boolean => normalized(first) === normalized(second);

/**
 * Returns `path` absolute, and on Windows in lower case, so two spellings of one path compare equal.
 */
const normalized = (path: string): string => {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
};

/**
 * Returns whether something exists at `path`.
 */
const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns the last lines that git printed in `output`, on one line.
 */
const lastLines = (output: GitOutput): string => {
  const text = `${output.stderr}\n${output.stdout}`;
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.slice(-QUOTED_LINE_COUNT).join(' ') || `exit code ${output.exitCode}`;
};

/**
 * Returns the trimmed standard output of git with the arguments `commandLine` in `directory`.
 * If git exits with an error, rejects with an error that quotes its last lines.
 */
const gitOutput = async (directory: string, commandLine: readonly string[]): Promise<string> => {
  const output = await runGit(directory, commandLine);
  if (output.exitCode === 0) return output.stdout.trim();
  throw new Error(`Git ${commandLine.join(' ')} failed in ${directory}: ${lastLines(output)}`);
};

/**
 * Returns the output of git with the arguments `commandLine` in `directory`, whatever its exit code. Git opens no
 * editor and asks for no credentials.
 */
const runGit = async (directory: string, commandLine: readonly string[]): Promise<GitOutput> => {
  try {
    const { stdout, stderr } = await execFileAsync('git', commandLine, {
      cwd: directory,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0' },
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    if (!isExitError(error)) throw error;
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};

/**
 * Returns whether `error` is the error of a git command that ran and exited with an error code.
 */
const isExitError = (error: unknown): error is Error & { code: number; stdout: string; stderr: string } =>
  error instanceof Error && 'code' in error && typeof error.code === 'number';
