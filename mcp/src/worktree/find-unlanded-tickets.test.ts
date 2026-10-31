import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type TestWorktreesRepository,
  testCommit,
  testTask,
  testTaskBranch,
  testTicket,
  testWorktrees,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { processRunGit } from './run-git.process.ts';
import type { RunGitFunction } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';

/**
 * `RunGitFunction` that runs git like the system does, except that `git log` fails as for a broken repository.
 */
const FAILING_LOG: RunGitFunction = async (directory, commandLine) =>
  commandLine.includes('log')
    ? { exitCode: 128, stdout: '', stderr: 'fatal: bad revision' }
    : processRunGit(directory, commandLine);

/**
 * Lands the ticket 2 of the task 1 of `repository`, then its ticket 1, each with a commit that adds a file of its own.
 * The tests of the suite only read the repository.
 */
const landedTickets = async ({ worktrees }: TestWorktreesRepository): Promise<void> => {
  for (const ticketId of [2, 1]) {
    const created = await worktrees.create(testTask(1), testTicket(ticketId), 'main');
    await testCommit(created.ticket.path, `cache-${ticketId}.txt`, 'cache');
    await worktrees.merge(testTask(1), testTicket(ticketId), 'feat: add the cache');
  }
};

describe('unlandedTickets', { concurrency: true }, () => {
  const repository = testWorktreesRepository(landedTickets);

  it('returns the ids of the landed tickets that the base branch lacks in ascending order', async () => {
    assert.deepEqual(await repository().worktrees.unlandedTickets(testTask(1), 'main'), [1, 2]);
  });

  it('counts every landed ticket of the task when the base branch is null or does not exist', async () => {
    const { worktrees } = repository();
    assert.deepEqual(await worktrees.unlandedTickets(testTask(1), null), [1, 2]);
    assert.deepEqual(await worktrees.unlandedTickets(testTask(1), 'missing'), [1, 2]);
  });

  it('leaves out the tickets whose commits the base branch holds', async () => {
    assert.deepEqual(await repository().worktrees.unlandedTickets(testTask(1), testTaskBranch(1)), []);
  });

  it('returns an empty array for a task without a task branch', async () => {
    assert.deepEqual(await repository().worktrees.unlandedTickets(testTask(9), 'main'), []);
  });

  it('rejects with an error that quotes the last lines of git when git fails', async () => {
    const { checkout, home } = repository();
    const worktrees = testWorktrees(checkout, home, FAILING_LOG);
    await assert.rejects(worktrees.unlandedTickets(testTask(1), 'main'), (error) => {
      assert.ok(error instanceof Error && !(error instanceof WorktreeError));
      assert.match(error.message, /^Git log .* failed in .*: fatal: bad revision$/);
      return true;
    });
  });
});
