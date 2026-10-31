import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  testCandidate,
  testCommit,
  testDivergedTask,
  testGit,
  testLandedTicket,
  testPathExists,
  testRefusal,
  testTask,
  testTaskBranch,
  testTicket,
  testTicketBranch,
  testWorktrees,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { WorktreeError } from './worktree-error.ts';

/**
 * Tips of the task branch and of the base branch of a task.
 */
interface Tips {
  /**
   * Tip of the task branch.
   */
  readonly task: string;

  /**
   * Tip of the base branch `main`.
   */
  readonly base: string;
}

/**
 * Returns the tips of the task branch of `testTask(taskId)` and of `main` in the main checkout `checkout`.
 */
const tipsOf = async (checkout: string, taskId: number): Promise<Tips> => ({
  task: await testGit(checkout, 'rev-parse', testTaskBranch(taskId)),
  base: await testGit(checkout, 'rev-parse', 'main'),
});

describe('mergeTask', () => {
  const repository = testWorktreesRepository();

  it('rebases the task branch onto the base branch into a candidate, lands it once its checks passed, and removes the task', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(1), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'cache.txt', 'cache');
    await worktrees.merge(testTask(1), testTicket(1), 'feat: add the cache');
    await testCommit(checkout, 'base.txt', 'base');
    const baseTip = await testGit(checkout, 'rev-parse', 'main');
    const candidate = await testCandidate(worktrees.mergeTask(testTask(1), 'main'));
    const merged = await worktrees.mergeTask(testTask(1), 'main', { commit: candidate.commit, failure: null });
    assert.deepEqual(
      { ...merged, deleted: { ...merged.deleted, worktrees: [...merged.deleted.worktrees].sort() } },
      {
        baseBranch: 'main',
        commit: candidate.commit,
        deleted: {
          worktrees: [created.ticket.path, created.task.path],
          branches: [testTicketBranch(1, 1), testTaskBranch(1)],
          stoppedProcesses: [],
          warnings: [],
        },
      },
    );
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), candidate.commit);
    assert.equal(await testGit(checkout, 'log', '--format=%P %s', '-1', 'main'), `${baseTip} feat: add the cache`);
    assert.equal(await testPathExists(join(checkout, 'cache.txt')), true);
    assert.equal(await testPathExists(dirname(created.task.path)), false);
    assert.equal(await testGit(checkout, 'branch', '--list', 'atomic-workflow/1-cache-layer/*'), '');
    assert.equal(await testGit(checkout, 'for-each-ref', 'refs/atomic-workflow/candidates/1-cache-layer/'), '');
  });

  it('rejects with needs-checks and leaves both branches where they are when the task branch must be rebased', async () => {
    const { checkout, worktrees } = repository();
    const created = await testDivergedTask(repository(), 11);
    const tips = await tipsOf(checkout, 11);
    const candidate = await testCandidate(worktrees.mergeTask(testTask(11), 'main'));
    assert.equal(candidate.worktree, created.task.path);
    assert.equal(await testGit(candidate.worktree, 'rev-parse', 'HEAD'), candidate.commit);
    assert.equal(await testGit(checkout, 'rev-parse', `${candidate.commit}~1`), tips.base);
    assert.deepEqual(await tipsOf(checkout, 11), tips);
  });

  it('rejects with not-allowed, drops the candidate and moves neither branch when a check failed', async () => {
    const { checkout, worktrees } = repository();
    const created = await testDivergedTask(repository(), 12);
    const tips = await tipsOf(checkout, 12);
    const candidate = await testCandidate(worktrees.mergeTask(testTask(12), 'main'));
    await assert.rejects(
      worktrees.mergeTask(testTask(12), 'main', {
        commit: candidate.commit,
        failure: { command: 'npm test', output: 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\n' },
      }),
      testRefusal(
        'not-allowed',
        new RegExp(
          `^The check npm test failed on the candidate ${candidate.commit}, so neither atomic-workflow/12-cache-layer/main nor main moved: line 2 line 3 line 4 line 5 line 6$`,
        ),
      ),
    );
    assert.deepEqual(await tipsOf(checkout, 12), tips);
    assert.equal(await testGit(created.task.path, 'branch', '--show-current'), testTaskBranch(12));
  });

  it('rejects with needs-checks for a new candidate when the base branch moved while the checks ran', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 13);
    const taskTip = (await tipsOf(checkout, 13)).task;
    const candidate = await testCandidate(worktrees.mergeTask(testTask(13), 'main'));
    await testCommit(checkout, 'moved-13.txt', 'moved');
    const baseTip = await testGit(checkout, 'rev-parse', 'main');
    const again = await testCandidate(
      worktrees.mergeTask(testTask(13), 'main', { commit: candidate.commit, failure: null }),
    );
    assert.notEqual(again.commit, candidate.commit);
    assert.equal(await testGit(checkout, 'rev-parse', `${again.commit}~1`), baseTip);
    assert.deepEqual(await tipsOf(checkout, 13), { task: taskTip, base: baseTip });
  });

  it('rejects with needs-checks once a rebase that stopped on a conflict continues, and leaves the base branch where it is', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(14), testTicket(1), 'main');
    await testCommit(created.task.path, 'conflict-14.txt', 'task');
    await testCommit(checkout, 'conflict-14.txt', 'base');
    const tips = await tipsOf(checkout, 14);
    await assert.rejects(worktrees.mergeTask(testTask(14), 'main'), testRefusal('conflict', /conflict-14\.txt/));
    await writeFile(join(created.task.path, 'conflict-14.txt'), 'both');
    await testGit(created.task.path, 'add', 'conflict-14.txt');
    const candidate = await testCandidate(worktrees.mergeTask(testTask(14), 'main'));
    assert.equal(await testGit(checkout, 'show', `${candidate.commit}:conflict-14.txt`), 'both');
    assert.deepEqual(await tipsOf(checkout, 14), tips);
  });

  it('lands a task branch that holds the base branch with no checks', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(15), testTicket(1), 'main');
    await testCommit(created.task.path, 'task-15.txt', 'task');
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(15));
    const merged = await worktrees.mergeTask(testTask(15), 'main');
    assert.equal(merged.commit, taskTip);
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), taskTip);
  });

  it('rejects with needs-checks for the same candidate after a restart while both branches stayed', async () => {
    const { checkout, home, worktrees } = repository();
    await testDivergedTask(repository(), 16);
    const candidate = await testCandidate(worktrees.mergeTask(testTask(16), 'main'));
    const restarted = testWorktrees(checkout, home);
    assert.deepEqual(await testCandidate(restarted.mergeTask(testTask(16), 'main')), candidate);
  });

  it('rejects with invalid-checks and moves no branch when checks name no candidate', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 17);
    const tips = await tipsOf(checkout, 17);
    await assert.rejects(
      worktrees.mergeTask(testTask(17), 'main', { commit: 'f'.repeat(40), failure: null }),
      testRefusal('invalid-checks', /is no candidate of atomic-workflow\/17-cache-layer\/main/),
    );
    assert.deepEqual(await tipsOf(checkout, 17), tips);
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

  it('lands nothing and returns the latest commit of the task when the base branch holds the task branch already', async () => {
    const { checkout, worktrees } = repository();
    const { landed } = await testLandedTicket(repository(), 20);
    await testGit(checkout, 'merge', '--ff-only', '--quiet', testTaskBranch(20));
    const merged = await worktrees.mergeTask(testTask(20), 'main');
    assert.equal(merged.commit, landed);
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), landed);
    assert.equal(await testGit(checkout, 'branch', '--list', 'atomic-workflow/20-cache-layer/*'), '');
  });

  it('removes what is left of a task whose task branch is gone and whose commits the base branch holds', async () => {
    const { checkout, worktrees } = repository();
    const { created, landed } = await testLandedTicket(repository(), 21);
    await testGit(checkout, 'merge', '--ff-only', '--quiet', testTaskBranch(21));
    await testGit(checkout, 'worktree', 'remove', '--force', created.task.path);
    await testGit(checkout, 'branch', '--quiet', '-D', testTaskBranch(21));
    assert.deepEqual(await worktrees.mergeTask(testTask(21), 'main'), {
      baseBranch: 'main',
      commit: landed,
      deleted: {
        worktrees: [created.ticket.path],
        branches: [testTicketBranch(21, 1)],
        stoppedProcesses: [],
        warnings: [],
      },
    });
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), landed);
    assert.equal(await testPathExists(dirname(created.task.path)), false);
    assert.equal(await testGit(checkout, 'branch', '--list', 'atomic-workflow/21-cache-layer/*'), '');
  });

  it('lands a task branch whose ticket branch is behind its old tip once the task branch moved to its candidate', async () => {
    const { checkout, worktrees } = repository();
    await testLandedTicket(repository(), 22);
    await testCommit(checkout, 'base-22.txt', 'base');
    const candidate = await testCandidate(worktrees.mergeTask(testTask(22), 'main'));
    // A merge that stopped right after it moved the task branch to its candidate leaves this state.
    await testGit(checkout, 'update-ref', `refs/heads/${testTaskBranch(22)}`, candidate.commit);
    const merged = await worktrees.mergeTask(testTask(22), 'main', { commit: candidate.commit, failure: null });
    assert.equal(merged.commit, candidate.commit);
    assert.deepEqual(merged.deleted.branches, [testTicketBranch(22, 1), testTaskBranch(22)]);
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), candidate.commit);
  });
});
