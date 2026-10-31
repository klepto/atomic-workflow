import type { CopyFailures, CopyIgnoredFunction } from './copy-ignored.ts';
import type { FileSystem } from './file-system.ts';
import type { RunGitFunction } from './run-git.ts';
import type { StopProcessesFunction } from './stop-processes.ts';

/**
 * Identifier and slug of a task or of a ticket, which name its branch and its worktree.
 */
export interface WorkName {
  /**
   * Identifier of the task, or of the ticket within its task.
   */
  readonly id: number;

  /**
   * Short name of the task or of the ticket in kebab case.
   */
  readonly slug: string;
}

/**
 * Worktree and the branch that it has checked out.
 */
export interface WorktreePlace {
  /**
   * Absolute path of the worktree, with forward slashes on every platform.
   */
  readonly path: string;

  /**
   * Name of the branch, without `refs/heads/`.
   */
  readonly branch: string;
}

/**
 * Worktrees of a task and of one of its tickets, ready for the work on the ticket.
 */
export interface CreatedWorktrees {
  /**
   * Worktree of the task branch, which holds the work of each ticket that landed.
   */
  readonly task: WorktreePlace;

  /**
   * Worktree of the ticket branch, which holds the commits of the ticket.
   */
  readonly ticket: WorktreePlace;

  /**
   * Branch that the task branch was made from.
   */
  readonly baseBranch: string;

  /**
   * Whether the call made the task branch. Each later call finds it.
   */
  readonly taskBranchCreated: boolean;

  /**
   * Whether the call made the ticket branch. A ticket branch that exists keeps its commits.
   */
  readonly ticketBranchCreated: boolean;

  /**
   * Whether the call moved the task branch onto the tip of the base branch, before it made the ticket branch or when
   * it continued a sync that stopped on a conflict.
   */
  readonly taskBranchSynced: boolean;

  /**
   * Whether the main checkout has changes of tracked files that no commit holds, when the call made the task branch.
   * Those changes are not on the task branch. `false` when the task branch existed already.
   */
  readonly uncommittedChanges: boolean;

  /**
   * Ignored files of the main checkout that could not be copied into a worktree that the call made, or `null` when
   * every copy succeeded or no worktree was made.
   */
  readonly copyFailures: CopyFailures | null;

  /**
   * One sentence for each cause that kept the task branch from a sync with the base branch, such as a ticket branch
   * made before fork points were recorded.
   */
  readonly warnings: readonly string[];
}

/**
 * Result of the checks that a caller ran on the candidate of a rebased task branch.
 */
export interface RebaseChecks {
  /**
   * Full hash of the candidate that the checks ran on, as the refusal `needs-checks` named it.
   */
  readonly commit: string;

  /**
   * First check that failed, or `null` when every check passed.
   */
  readonly failure: CheckFailure | null;
}

/**
 * Check that failed on a candidate.
 */
export interface CheckFailure {
  /**
   * Command of the check.
   */
  readonly command: string;

  /**
   * Output of the command.
   */
  readonly output: string;
}

/**
 * Work of a ticket after it landed on the task branch.
 */
export interface MergedTicket {
  /**
   * Name of the task branch, without `refs/heads/`.
   */
  readonly taskBranch: string;

  /**
   * Id of the one commit of the ticket at the tip of the task branch, or `null` when the ticket changed nothing.
   */
  readonly commit: string | null;
}

/**
 * Commit that holds the landed work of a ticket, with the files that it changes.
 */
export interface TicketChanges {
  /**
   * Id of the commit.
   */
  readonly commit: string;

  /**
   * Changed files, in the order of `git show -M`.
   */
  readonly files: readonly ChangedFile[];
}

/**
 * Kind of the change of a file: `added`, `deleted`, `modified`, `renamed` or `copied`.
 */
export type ChangedFileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

/**
 * File that a commit changes, with the section of the patch of the commit for it, unless the file is big.
 */
export interface ChangedFile {
  /**
   * Path that names the file: its new path, or its old path for a deleted file.
   */
  readonly path: string;

  /**
   * Path before a rename or a copy, else `null`.
   */
  readonly oldPath: string | null;

  /**
   * Kind of the change.
   */
  readonly status: ChangedFileStatus;

  /**
   * Added lines, as `git show --numstat` counts them. 0 for a binary file.
   */
  readonly additions: number;

  /**
   * Deleted lines, as `git show --numstat` counts them. 0 for a binary file.
   */
  readonly deletions: number;

  /**
   * Whether git reads the file as binary.
   */
  readonly binary: boolean;

  /**
   * Whether the file is build output or minified: the attribute `linguist-generated` of its path, or a rule on its
   * path when the attribute is unspecified.
   */
  readonly generated: boolean;

  /**
   * Section of the patch of `git show -M` for this file alone, from its `diff --git` line to the line before the next
   * file, with paths not quoted. `null` for a big file: over 1,000 changed lines, or an old or new blob over 1 MB.
   */
  readonly patch: string | null;
}

/**
 * Work of a task after its task branch landed on its base branch.
 */
export interface MergedTask {
  /**
   * Name of the base branch, without `refs/heads/`.
   */
  readonly baseBranch: string;

  /**
   * Id of the commit at the tip of the base branch after the merge, or `null` when the base branch held the task
   * branch already.
   */
  readonly commit: string | null;

  /**
   * Worktrees and branches of the task that the merge removed once the task branch landed.
   */
  readonly deleted: DeletedWorktrees;
}

/**
 * Worktrees and branches that a deletion removed.
 */
export interface DeletedWorktrees {
  /**
   * Absolute paths of the removed worktrees, with forward slashes.
   */
  readonly worktrees: readonly string[];

  /**
   * Names of the deleted branches, without `refs/heads/`.
   */
  readonly branches: readonly string[];

  /**
   * One line for each process that ran from a removed directory and was stopped before the removal, with its
   * identifier and the start of its command line.
   */
  readonly stoppedProcesses: readonly string[];

  /**
   * One sentence for each worktree or branch that could not be removed, such as a directory that another program
   * holds, and for each process that ran from a removed directory and could not be stopped.
   */
  readonly warnings: readonly string[];
}

/**
 * Branches and worktrees of the tasks of one repository.
 * A task has a task branch, `atomic-workflow/<task id>-<task slug>/main`, made from its base branch on the start of
 * its first ticket, which holds only the work of the tickets that landed. Each ticket works on a branch of its own,
 * `atomic-workflow/<task id>-<task slug>/<ticket id>-<ticket slug>`, made from the task branch once it is synced with
 * the base branch. The commit of the task branch that a ticket branch starts from is its fork point, which stays
 * right when a sync rewrites the task branch. Each branch has a worktree of its own in a directory of the repository
 * below the home of the user, outside the main checkout, so no tool of the main checkout indexes it. Each process that
 * runs from a worktree or a directory of a task, such as a dev server that an agent left behind, is stopped before its
 * removal, so it holds none of its files.
 * A call that the state of the repository does not allow rejects with a `WorktreeError`. Only unexpected failures,
 * such as a missing git program, reject with another error. Calls run one at a time, in the order they came, so
 * two calls never change the branches of a repository at once: a sync of a task branch never runs while a ticket
 * lands on it.
 */
export interface Worktrees {
  /**
   * Returns the worktrees of the task `task` and of its ticket `ticket`, made where they do not exist. The task branch
   * is made from `baseBranch`, or from the branch that the main checkout has checked out when `baseBranch` is `null`.
   * Before a ticket branch is made, the task branch is synced with the local tip of the base branch in the worktree of
   * the task: it moves forward to the tip when the base branch holds it, and stays when it holds the tip. Any other
   * task branch is rebased onto the tip as a candidate, in the worktree of the task with a detached `HEAD`, and moves
   * to the candidate only once a later call reports with `checks` that its checks passed, as the rebase checks
   * protocol of the design says. The ticket branch is then made from the tip of the task branch, which becomes its
   * fork point. The sync is skipped, with a warning, when the base branch does not exist, the worktree of the task has
   * changes that no commit holds, another ticket branch of the task has no fork point, a check failed, or a branch
   * moved while the checks ran. A sync that stopped on a conflict, whose conflicting files are resolved and added,
   * continues on any later call into a candidate. A branch that exists keeps its commits. Each worktree that the call
   * makes gets a copy of the ignored files of the main checkout.
   * If the task branch must be made but the main checkout has no branch checked out, the ticket branch must be made
   * but the worktree of the task has a stopped rebase that is no sync, or git refuses to make a branch or a worktree,
   * rejects with `not-allowed`. If the rebase of the sync stops on a conflict, rejects with `conflict`, makes no
   * ticket branch, and leaves the rebase stopped in the worktree of the task. If the rebase ends in a candidate, or a
   * new ticket branch must be made while the candidate of an earlier call waits and both branches stayed, rejects with
   * `needs-checks` and makes no ticket branch. If `checks` names no candidate, rejects with `invalid-checks`.
   */
  create(task: WorkName, ticket: WorkName, baseBranch: string | null, checks?: RebaseChecks): Promise<CreatedWorktrees>;

  /**
   * Returns the work of the ticket `ticket` of the task `task` after it landed on the task branch: the commits of the
   * ticket branch since its fork point are squashed into one commit with the message `message`, rebased onto the task
   * branch, and the task branch moves forward to it. The message ends with the trailers `Atomic-Workflow-Task` and
   * `Atomic-Workflow-Ticket`, which name the task and the ticket as `<id>-<slug>`, so the commit stays found after a
   * rebase. A ticket branch without a fork point, made before fork points
   * were recorded, starts at its merge base with the task branch instead. A ticket branch whose rebase stopped on a
   * conflict, and whose conflicting files are resolved and added, continues the rebase instead. A merge that stopped
   * at any step, such as on a crash, finishes on the next call. A ticket whose commit is on the task branch already
   * returns that commit, with no move of the task branch, even once its worktree is gone.
   * If the ticket has no worktree, its worktree has changes that no commit holds, the worktree of the task has a
   * stopped rebase, or the task branch cannot move forward, rejects with `not-allowed`. If the rebase stops on a
   * conflict, rejects with `conflict`, and leaves the rebase stopped in the worktree of the ticket.
   */
  merge(task: WorkName, ticket: WorkName, message: string): Promise<MergedTicket>;

  /**
   * Returns the commit that holds the landed work of the ticket `ticket` of the task `task`, with the files that it
   * changes: the latest commit whose trailers name both, on the task branch, or on the base branch `baseBranch` once
   * the task branch is gone. Each file comes with its section of the patch, unless it is big. If no such commit
   * exists, such as for a ticket that changed nothing or that landed before the trailers were written, returns
   * `undefined` instead.
   * If git fails to find or to show the commit, rejects with an error that quotes the last lines of git.
   */
  ticketChanges(task: WorkName, ticket: WorkName, baseBranch: string | null): Promise<TicketChanges | undefined>;

  /**
   * Returns the section of the patch of the file `path` of the commit `commit`, in the form of `ChangedFile.patch`,
   * where `commit` is the commit that `ticketChanges` finds for the ticket `ticket` of the task `task` with
   * `baseBranch`. If the commit does not change a file named `path`, returns `undefined` instead.
   * If `commit` is no longer the commit of the ticket, rejects with `not-allowed`. If git fails, rejects with an error
   * that quotes the last lines of git.
   */
  ticketFilePatch(
    task: WorkName,
    ticket: WorkName,
    baseBranch: string | null,
    commit: string,
    path: string,
  ): Promise<string | undefined>;

  /**
   * Returns the ids of the tickets of the task `task` whose landed work a removal of the task branch would throw away,
   * in ascending order: the tickets that the trailers of the commits name, which the task branch holds and the base
   * branch `baseBranch` lacks. When `baseBranch` is `null` or does not exist, every commit of the task on the task
   * branch counts. Without a task branch, returns an empty array. A ticket that changed nothing, or that landed before
   * the trailers were written, has no such commit.
   * If git fails, rejects with an error that quotes the last lines of git.
   */
  unlandedTickets(task: WorkName, baseBranch: string | null): Promise<readonly number[]>;

  /**
   * Returns the work of the task `task` after its task branch landed on the base branch `baseBranch`: a task branch
   * that holds the base branch, or that the base branch holds, lands as it is. Any other task branch is rebased onto
   * the base branch as a candidate, in the worktree of the task with a detached `HEAD`, made where it does not exist,
   * and lands only once a later call reports with `checks` that the checks of the candidate passed, as the rebase
   * checks protocol of the design says. The base branch then moves forward to the task branch, and every worktree and
   * branch of the task is removed. A task branch whose rebase stopped on a conflict, and whose conflicting files are
   * resolved and added, continues the rebase into a candidate instead. A merge that stopped at any step finishes when
   * it is called again with the same arguments, and moves no branch twice: a task branch that the base branch holds
   * already lands nothing, and a task branch that is gone, whose commits the base branch holds, only has the worktrees,
   * branches and directory of the task that are left removed. The commit of the result is then the latest commit whose
   * trailer names the task, or `null` when there is none.
   * If the base branch does not exist, the task branch does not exist while the base branch holds no commit of the
   * task, a ticket branch holds commits that neither the task branch nor an earlier tip of it holds, the main checkout
   * has a branch of the task checked out, a worktree of the task has changes that no commit holds, a check of `checks`
   * failed, or the base branch cannot move forward, rejects with `not-allowed`. If the rebase stops
   * on a conflict, rejects with `conflict`, and leaves the rebase stopped in the worktree of the task. If the rebase
   * ends in a candidate, or a call without `checks` finds the candidate of an earlier call while both branches stayed,
   * rejects with `needs-checks`. If `checks` names no candidate, rejects with `invalid-checks`.
   */
  mergeTask(task: WorkName, baseBranch: string, checks?: RebaseChecks): Promise<MergedTask>;

  /**
   * Returns the tip of the landing of the task `task` on the base branch `baseBranch`: the latest commit whose trailer
   * names the task. If the base branch does not exist or holds no such commit, returns `undefined` instead.
   * If git fails, rejects with an error that quotes the last lines of git.
   */
  taskLanding(task: WorkName, baseBranch: string): Promise<string | undefined>;

  /**
   * Returns what the removal of the worktree and the branch of the ticket `ticket` of the task `task` removed. Removing
   * nothing is no error. The main checkout is never removed.
   * If the main checkout has the ticket branch checked out, rejects with `not-allowed` and removes nothing, even with
   * `force`. Unless `force`, if the ticket branch holds commits that the task branch lacks, or the worktree has changes that
   * no commit holds, rejects with `not-allowed` and removes nothing.
   */
  deleteTicket(task: WorkName, ticket: WorkName, force: boolean): Promise<DeletedWorktrees>;

  /**
   * Returns what the removal of every worktree and branch of the task `task` removed, the task branch included.
   * Removing nothing is no error. The main checkout is never removed.
   * If the main checkout has a branch of the task checked out, rejects with `not-allowed` and removes nothing, even
   * with `force`. Unless `force`, if the task branch holds commits that the base branch `baseBranch` lacks, `baseBranch` is `null`
   * or does not exist, a ticket branch holds commits that the task branch lacks, or a worktree has changes that no
   * commit holds, rejects with `not-allowed` and removes nothing.
   */
  deleteTask(task: WorkName, baseBranch: string | null, force: boolean): Promise<DeletedWorktrees>;
}

/**
 * Settings of the `Worktrees` of one repository.
 */
export interface WorktreesOptions {
  /**
   * Absolute path of the main worktree of the repository, the checkout that every other worktree was added from.
   */
  readonly checkout: string;

  /**
   * Absolute path of the home of the user, below which the worktrees live.
   */
  readonly home: string;

  /**
   * Platform that the paths belong to, such as `win32`, where two paths that differ only in their case are the same.
   */
  readonly platform: NodeJS.Platform;
}

/**
 * Adapters that `Worktrees` run on.
 */
export interface WorktreesDependencies {
  /**
   * Function that runs git.
   */
  readonly runGit: RunGitFunction;

  /**
   * Files and directories of the worktrees.
   */
  readonly fileSystem: FileSystem;

  /**
   * Function that copies the ignored files of the main checkout into a new worktree.
   */
  readonly copyIgnored: CopyIgnoredFunction;

  /**
   * Function that stops the processes that run from a worktree or a directory before its removal, so no process holds
   * its files.
   */
  readonly stopProcesses: StopProcessesFunction;
}

/**
 * Function that returns the `Worktrees` of the repository whose main worktree `options` names, which run on the
 * adapters `dependencies`. Throws nothing: each call of the `Worktrees` rejects on its own.
 */
export type CreateWorktreesFunction = (options: WorktreesOptions, dependencies: WorktreesDependencies) => Worktrees;
