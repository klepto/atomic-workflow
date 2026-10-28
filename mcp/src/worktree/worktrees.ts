import type { CopyFailures, CopyIgnoredFunction } from './copy-ignored.ts';
import type { StopProcessesFunction } from './stop-processes.ts';
import { gitCreateWorktrees } from './worktrees.git.ts';

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
 * Commit that holds the landed work of a ticket, with its changes.
 */
export interface TicketCommit {
  /**
   * Id of the commit.
   */
  readonly commit: string;

  /**
   * Changes of the commit against its parent, as the patch of `git show` with renames detected, and paths that are
   * not quoted.
   */
  readonly patch: string;
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
   * the task: it moves forward to the tip, or is rebased onto it when it holds commits that the base branch lacks.
   * The ticket branch is then made from the tip of the task branch, which becomes its fork point. The sync is skipped,
   * with a warning, when the base branch does not exist, the worktree of the task has changes that no commit holds, or
   * another ticket branch of the task has no fork point. A sync that stopped on a conflict, whose conflicting files
   * are resolved and added, continues on any later call. A branch that exists keeps its commits. Each worktree that
   * the call makes gets a copy of the ignored files of the main checkout.
   * If the task branch must be made but the main checkout has no branch checked out, the ticket branch must be made
   * but the worktree of the task has a stopped rebase that is no sync, or git refuses to make a branch or a worktree,
   * rejects with `not-allowed`. If the rebase of the sync stops on a conflict, rejects with `conflict`, makes no
   * ticket branch, and leaves the rebase stopped in the worktree of the task.
   */
  create(task: WorkName, ticket: WorkName, baseBranch: string | null): Promise<CreatedWorktrees>;

  /**
   * Returns the work of the ticket `ticket` of the task `task` after it landed on the task branch: the commits of the
   * ticket branch since its fork point are squashed into one commit with the message `message`, rebased onto the task
   * branch, and the task branch moves forward to it. The message ends with the trailers `Atomic-Workflow-Task` and
   * `Atomic-Workflow-Ticket`, which name the task and the ticket as `<id>-<slug>`, so the commit stays found after a
   * rebase. A ticket branch without a fork point, made before fork points
   * were recorded, starts at its merge base with the task branch instead. A ticket branch whose rebase stopped on a
   * conflict, and whose conflicting files are resolved and added, continues the rebase instead.
   * If the ticket has no worktree, its worktree has changes that no commit holds, the worktree of the task has a
   * stopped rebase, or the task branch cannot move forward, rejects with `not-allowed`. If the rebase stops on a
   * conflict, rejects with `conflict`, and leaves the rebase stopped in the worktree of the ticket.
   */
  merge(task: WorkName, ticket: WorkName, message: string): Promise<MergedTicket>;

  /**
   * Returns the commit that holds the landed work of the ticket `ticket` of the task `task`: the latest commit whose
   * trailers name both, on the task branch, or on the base branch `baseBranch` once the task branch is gone. If no
   * such commit exists, such as for a ticket that changed nothing or that landed before the trailers were written,
   * returns `undefined` instead.
   */
  ticketCommit(task: WorkName, ticket: WorkName, baseBranch: string | null): Promise<TicketCommit | undefined>;

  /**
   * Returns the work of the task `task` after its task branch landed on the base branch `baseBranch`: the task branch
   * is rebased onto the base branch in the worktree of the task, made where it does not exist, and the base branch
   * moves forward to it, then every worktree and branch of the task is removed. A task branch whose rebase stopped on
   * a conflict, and whose conflicting files are resolved and added, continues the rebase instead.
   * If the task branch or the base branch does not exist, a ticket branch holds commits that the task branch lacks, a
   * worktree of the task has changes that no commit holds, or the base branch cannot move forward, rejects with
   * `not-allowed`. If the rebase stops on a conflict, rejects with `conflict`, and leaves the rebase stopped in the
   * worktree of the task.
   */
  mergeTask(task: WorkName, baseBranch: string): Promise<MergedTask>;

  /**
   * Returns what the removal of the worktree and the branch of the ticket `ticket` of the task `task` removed. Removing
   * nothing is no error.
   * Unless `force`, if the ticket branch holds commits that the task branch lacks, or the worktree has changes that
   * no commit holds, rejects with `not-allowed` and removes nothing.
   */
  deleteTicket(task: WorkName, ticket: WorkName, force: boolean): Promise<DeletedWorktrees>;

  /**
   * Returns what the removal of every worktree and branch of the task `task` removed, the task branch included.
   * Removing nothing is no error.
   * Unless `force`, if the task branch holds commits that the base branch `baseBranch` lacks, `baseBranch` is `null`
   * or does not exist, a ticket branch holds commits that the task branch lacks, or a worktree has changes that no
   * commit holds, rejects with `not-allowed` and removes nothing.
   */
  deleteTask(task: WorkName, baseBranch: string | null, force: boolean): Promise<DeletedWorktrees>;
}

/**
 * Parts that `Worktrees` are built from.
 */
export interface WorktreesDependencies {
  /**
   * Absolute path of a directory of the repository, in any of its worktrees.
   */
  readonly directory: string;

  /**
   * Absolute path of the home of the user, below which the worktrees live.
   */
  readonly home: string;

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
 * Function that returns the `Worktrees` of the repository of `dependencies`.
 */
export type CreateWorktreesFunction = (dependencies: WorktreesDependencies) => Worktrees;

/**
 * Default `CreateWorktreesFunction`, which runs git, and keeps the worktrees of a repository in
 * `.atomic-workflow/worktrees/<repository name>-<hash>/` of the home of the user.
 */
export const CreateWorktrees: CreateWorktreesFunction = gitCreateWorktrees;
