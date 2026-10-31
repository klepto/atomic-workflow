import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type TestWorktreesRepository,
  testCommit,
  testGit,
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
 * `RunGitFunction` that runs git like the system does, except that `git show` fails as for a missing commit.
 */
const FAILING_SHOW: RunGitFunction = async (directory, commandLine) =>
  commandLine.includes('show')
    ? { exitCode: 128, stdout: '', stderr: 'fatal: bad object' }
    : processRunGit(directory, commandLine);

/**
 * Lands the ticket 1 of the task 1 of `repository` with a commit that adds the file `cache.txt`. The tests of the
 * suite only read the repository.
 */
const landedTicket = async ({ worktrees }: TestWorktreesRepository): Promise<void> => {
  const created = await worktrees.create(testTask(1), testTicket(1), 'main');
  await testCommit(created.ticket.path, 'cache.txt', 'cache');
  await worktrees.merge(testTask(1), testTicket(1), 'feat: add the cache');
};

describe('ticketChanges', { concurrency: true }, () => {
  const repository = testWorktreesRepository(landedTicket);

  it('returns the latest commit whose trailers name the task and the ticket, with its changed files', async () => {
    const { checkout, worktrees } = repository();
    const found = await worktrees.ticketChanges(testTask(1), testTicket(1), 'main');
    assert.equal(found?.commit, await testGit(checkout, 'rev-parse', testTaskBranch(1)));
    const [file, ...others] = found?.files ?? [];
    assert.deepEqual(others, []);
    assert.deepEqual(
      { ...file, patch: undefined },
      {
        path: 'cache.txt',
        oldPath: null,
        status: 'added',
        additions: 1,
        deletions: 0,
        binary: false,
        generated: false,
        patch: undefined,
      },
    );
    assert.match(file?.patch ?? '', /^diff --git a\/cache\.txt b\/cache\.txt\n/);
    assert.match(file?.patch ?? '', /\n\+cache\n/);
  });

  it('returns undefined for a ticket that landed no commit', async () => {
    assert.equal(await repository().worktrees.ticketChanges(testTask(1), testTicket(2), 'main'), undefined);
  });

  it('returns undefined when neither the task branch nor the base branch exists', async () => {
    const { worktrees } = repository();
    assert.equal(await worktrees.ticketChanges(testTask(9), testTicket(1), null), undefined);
    assert.equal(await worktrees.ticketChanges(testTask(9), testTicket(1), 'missing'), undefined);
  });

  it('rejects with an error that quotes the last lines of git when git fails to show the commit', async () => {
    const { checkout, home } = repository();
    const worktrees = testWorktrees(checkout, home, FAILING_SHOW);
    await assert.rejects(worktrees.ticketChanges(testTask(1), testTicket(1), 'main'), (error) => {
      assert.ok(error instanceof Error && !(error instanceof WorktreeError));
      assert.match(error.message, /^Git .*show.* failed in .*: fatal: bad object$/);
      return true;
    });
  });
});

describe('ticketFilePatch', { concurrency: true }, () => {
  const repository = testWorktreesRepository(landedTicket);

  it('returns the section of the patch of a file of the commit of the ticket', async () => {
    const { checkout, worktrees } = repository();
    const commit = await testGit(checkout, 'rev-parse', testTaskBranch(1));
    const patch = await worktrees.ticketFilePatch(testTask(1), testTicket(1), 'main', commit, 'cache.txt');
    assert.match(patch ?? '', /^diff --git a\/cache\.txt b\/cache\.txt\n/);
    assert.match(patch ?? '', /\n\+cache\n/);
  });

  it('returns undefined for a file that the commit does not change', async () => {
    const { checkout, worktrees } = repository();
    const commit = await testGit(checkout, 'rev-parse', testTaskBranch(1));
    assert.equal(await worktrees.ticketFilePatch(testTask(1), testTicket(1), 'main', commit, 'other.txt'), undefined);
  });

  it('rejects a commit that is no longer the commit of the ticket with not-allowed', async () => {
    const { checkout, worktrees } = repository();
    const stale = await testGit(checkout, 'rev-parse', 'main');
    await assert.rejects(worktrees.ticketFilePatch(testTask(1), testTicket(1), 'main', stale, 'cache.txt'), (error) => {
      assert.ok(error instanceof WorktreeError);
      assert.equal(error.kind, 'not-allowed');
      assert.match(error.message, /moved to another commit than/);
      return true;
    });
  });
});
