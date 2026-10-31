import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before } from 'node:test';
import { diskCopyIgnored } from '../worktree/copy-ignored.disk.ts';
import { createWorktrees } from '../worktree/create-worktrees.ts';
import { diskFileSystem } from '../worktree/file-system.disk.ts';
import { processRunGit } from '../worktree/run-git.process.ts';
import { gitOutput, type RunGitFunction } from '../worktree/run-git.ts';
import type { StopProcessesFunction } from '../worktree/stop-processes.ts';
import { WorktreeError, type WorktreeErrorKind } from '../worktree/worktree-error.ts';
import type { WorkName, Worktrees } from '../worktree/worktrees.ts';
import { testGitRepository } from './test-git-repository.ts';

/**
 * Slug of every task of the worktree tests.
 */
const TASK_SLUG = 'cache-layer';

/**
 * Slug of every ticket of the worktree tests.
 */
const TICKET_SLUG = 'add-cache';

/**
 * `StopProcessesFunction` that stops nothing, since no process runs from the worktree of a test.
 */
const NO_STOP: StopProcessesFunction = async () => ({ stopped: [], failures: [] });

/**
 * Git repository that the tests of a suite share, with the `Worktrees` of its main checkout.
 */
export interface TestWorktreesRepository {
  /**
   * Absolute real path of the main checkout, which has the branch `main` checked out.
   */
  readonly checkout: string;

  /**
   * Absolute path of the home of the user of the `Worktrees`, a directory below the main checkout, which the
   * removal of the repository removes too.
   */
  readonly home: string;

  /**
   * `Worktrees` of the main checkout, which run real git.
   */
  readonly worktrees: Worktrees;
}

/**
 * Returns the `Worktrees` of the main checkout `checkout`, with the home `home`, which run git with `runGit`, the git
 * program of the system by default, and the file system and the copy of the ignored files on the disk. They stop no
 * process.
 */
export const testWorktrees = (checkout: string, home: string, runGit: RunGitFunction = processRunGit): Worktrees =>
  createWorktrees(
    { checkout, home, platform: process.platform },
    { runGit, fileSystem: diskFileSystem, copyIgnored: diskCopyIgnored, stopProcesses: NO_STOP },
  );

/**
 * Registers hooks of the suite that calls it, which make a `testGitRepository` with the `Worktrees` of its main
 * checkout and a home below it, and run `setUp` on it, before the first test of the suite, and remove it after the last
 * one, whether the tests pass or fail. Returns a function that returns the repository to a test of the suite. Call it
 * only in the body of a `describe` or at the top level of a test file, whose tests then share the repository, so each
 * test must not change what another one of them reads.
 */
export const testWorktreesRepository = (
  setUp: (repository: TestWorktreesRepository) => Promise<void> = async () => undefined,
): (() => TestWorktreesRepository) => {
  const removals: (() => Promise<void>)[] = [];
  let repository: TestWorktreesRepository | undefined;
  before(async () => {
    const checkout = await testGitRepository({ after: (removal) => removals.push(removal) });
    const home = join(checkout, 'home');
    const made = { checkout, home, worktrees: testWorktrees(checkout, home) };
    await setUp(made);
    repository = made;
  });
  after(async () => {
    for (const removal of removals) await removal();
  });
  return () => {
    assert.ok(repository, 'The repository of the suite is missing, since its before hook failed');
    return repository;
  };
};

/**
 * Returns the task `id` of the worktree tests, with the slug `cache-layer`.
 */
export const testTask = (id: number): WorkName => ({ id, slug: TASK_SLUG });

/**
 * Returns the ticket `id` of the worktree tests, with the slug `add-cache`.
 */
export const testTicket = (id: number): WorkName => ({ id, slug: TICKET_SLUG });

/**
 * Returns the name of the task branch of `testTask(taskId)`.
 */
export const testTaskBranch = (taskId: number): string => `atomic-workflow/${taskId}-${TASK_SLUG}/main`;

/**
 * Returns the name of the ticket branch of `testTicket(ticketId)` of `testTask(taskId)`.
 */
export const testTicketBranch = (taskId: number, ticketId: number): string =>
  `atomic-workflow/${taskId}-${TASK_SLUG}/${ticketId}-${TICKET_SLUG}`;

/**
 * Returns the trimmed standard output of git with the arguments `commandLine` in the directory `directory`.
 * If git exits with an error, rejects with the error of `gitFailure`.
 */
export const testGit = async (directory: string, ...commandLine: string[]): Promise<string> =>
  gitOutput(directory, commandLine, processRunGit);

/**
 * Writes the text `text` to the file `file` of the worktree `directory`, and commits it there.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const testCommit = async (directory: string, file: string, text: string): Promise<void> => {
  await writeFile(join(directory, file), text);
  await testGit(directory, 'add', file);
  await testGit(directory, 'commit', '--quiet', '--message', `Write ${file}`);
};

/**
 * Leaves a rebase stopped on a conflict in the file `file` in the worktree `directory`, which has a branch checked out:
 * the rebase of a new commit of the branch onto a commit of another branch, `side/<branch>`, that writes the file
 * differently.
 * If git fails before the rebase, rejects with the error of `gitFailure`.
 */
export const testStoppedRebase = async (directory: string, file: string): Promise<void> => {
  const branch = await testGit(directory, 'branch', '--show-current');
  await testCommit(directory, file, 'side\n');
  await testGit(directory, 'branch', `side/${branch}`);
  await testGit(directory, 'reset', '--quiet', '--hard', 'HEAD~1');
  await testCommit(directory, file, 'branch\n');
  const output = await processRunGit(directory, ['rebase', `side/${branch}`]);
  assert.notEqual(output.exitCode, 0, 'The rebase did not stop');
};

/**
 * Returns whether a file or a directory exists at `path`.
 */
export const testPathExists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Returns a function for `assert.rejects` that accepts a `WorktreeError` of the kind `kind` whose message matches
 * `message`, and fails the test for any other error.
 */
export const testRefusal =
  (kind: WorktreeErrorKind, message: RegExp): ((error: unknown) => boolean) =>
  (error) => {
    assert.ok(error instanceof WorktreeError, `The error ${String(error)} is no WorktreeError`);
    assert.equal(error.kind, kind);
    assert.match(error.message, message);
    return true;
  };
