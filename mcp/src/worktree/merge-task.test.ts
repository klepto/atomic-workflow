import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  testCommit,
  testGit,
  testPathExists,
  testRefusal,
  testTask,
  testTaskBranch,
  testTicket,
  testTicketBranch,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { WorktreeError } from './worktree-error.ts';

describe('mergeTask', () => {
  const repository = testWorktreesRepository();

  it('rebases the task branch onto the base branch, moves the base branch to it, and removes the task', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(1), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'cache.txt', 'cache');
    await worktrees.merge(testTask(1), testTicket(1), 'feat: add the cache');
    await testCommit(checkout, 'base.txt', 'base');
    const baseTip = await testGit(checkout, 'rev-parse', 'main');
    const merged = await worktrees.mergeTask(testTask(1), 'main');
    assert.deepEqual(
      { ...merged, deleted: { ...merged.deleted, worktrees: [...merged.deleted.worktrees].sort() } },
      {
        baseBranch: 'main',
        commit: await testGit(checkout, 'rev-parse', 'main'),
        deleted: {
          worktrees: [created.ticket.path, created.task.path],
          branches: [testTicketBranch(1, 1), testTaskBranch(1)],
          stoppedProcesses: [],
          warnings: [],
        },
      },
    );
    assert.equal(await testGit(checkout, 'log', '--format=%P %s', '-1', 'main'), `${baseTip} feat: add the cache`);
    assert.equal(await testPathExists(join(checkout, 'cache.txt')), true);
    assert.equal(await testPathExists(dirname(created.task.path)), false);
    assert.equal(await testGit(checkout, 'branch', '--list', 'atomic-workflow/1-cache-layer/*'), '');
  });

  it('rejects with conflict and leaves the rebase stopped in the worktree of the task when the rebase stops', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(2), testTicket(1), 'main');
    await testCommit(created.task.path, 'conflict.txt', 'task');
    await testCommit(checkout, 'conflict.txt', 'base');
    await assert.rejects(worktrees.mergeTask(testTask(2), 'main'), (error) => {
      testRefusal('conflict', /conflict\.txt/)(error);
      assert.ok(error instanceof WorktreeError);
      assert.deepEqual(error.files, ['conflict.txt']);
      return true;
    });
    const rebaseDirectory = await testGit(
      created.task.path,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'rebase-merge',
    );
    assert.equal(await testPathExists(rebaseDirectory), true);
  });

  it('rejects with not-allowed when the task branch does not exist', async () => {
    await assert.rejects(
      repository().worktrees.mergeTask(testTask(3), 'main'),
      testRefusal('not-allowed', /The branch atomic-workflow\/3-cache-layer\/main does not exist/),
    );
  });

  it('rejects with not-allowed when the base branch does not exist', async () => {
    const { worktrees } = repository();
    await worktrees.create(testTask(4), testTicket(1), 'main');
    await assert.rejects(
      worktrees.mergeTask(testTask(4), 'missing'),
      testRefusal('not-allowed', /The branch missing does not exist/),
    );
  });

  it('rejects with not-allowed when a ticket branch holds commits that the task branch lacks', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(5), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'unlanded.txt', 'ticket');
    await assert.rejects(
      worktrees.mergeTask(testTask(5), 'main'),
      testRefusal('not-allowed', /atomic-workflow\/5-cache-layer\/1-add-cache hold commits that .* lacks/),
    );
  });

  it('rejects with not-allowed when the main checkout has a branch of the task checked out', async () => {
    const { checkout, worktrees } = repository();
    await testGit(checkout, 'checkout', '--quiet', '-b', testTaskBranch(6));
    try {
      await assert.rejects(
        worktrees.mergeTask(testTask(6), 'main'),
        testRefusal(
          'not-allowed',
          /The main checkout .* has the branch atomic-workflow\/6-cache-layer\/main checked out/,
        ),
      );
    } finally {
      await testGit(checkout, 'checkout', '--quiet', 'main');
    }
  });

  it('rejects with not-allowed when a worktree of the task has changes that no commit holds', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(7), testTicket(1), 'main');
    await writeFile(join(created.ticket.path, 'scratch.txt'), 'scratch');
    await assert.rejects(
      worktrees.mergeTask(testTask(7), 'main'),
      testRefusal('not-allowed', /has changes that no commit holds: \?\? scratch\.txt/),
    );
  });

  it('rejects with not-allowed when the base branch cannot move forward to the task branch', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(8), testTicket(1), 'main');
    await testCommit(created.task.path, 'blocked.txt', 'task');
    await writeFile(join(checkout, 'blocked.txt'), 'untracked');
    try {
      await assert.rejects(
        worktrees.mergeTask(testTask(8), 'main'),
        testRefusal('not-allowed', /Git refused to move main forward/),
      );
    } finally {
      await rm(join(checkout, 'blocked.txt'));
    }
  });
});
