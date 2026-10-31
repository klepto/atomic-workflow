import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  type TestWorktreesRepository,
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
import type { DeletedWorktrees } from './worktrees.ts';

/**
 * Deletion that removed nothing.
 */
const NOTHING_DELETED: DeletedWorktrees = { worktrees: [], branches: [], stoppedProcesses: [], warnings: [] };

/**
 * Sets up three tasks in `repository` whose removal loses work: the ticket 1 of the task 1 has a commit that the task
 * branch lacks, the worktree of the ticket 1 of the task 2 has a file that no commit holds, and the task branch of the
 * task 3 has a commit that `main` lacks. The other tests of the file use tasks of their own.
 */
const refusedTasks = async ({ worktrees }: TestWorktreesRepository): Promise<void> => {
  const unlanded = await worktrees.create(testTask(1), testTicket(1), 'main');
  await testCommit(unlanded.ticket.path, 'unlanded.txt', 'ticket');
  const changed = await worktrees.create(testTask(2), testTicket(1), 'main');
  await writeFile(join(changed.ticket.path, 'scratch.txt'), 'scratch');
  const ahead = await worktrees.create(testTask(3), testTicket(1), 'main');
  await testCommit(ahead.task.path, 'task.txt', 'task');
};

/**
 * Repository that every test of the file shares.
 */
const repository = testWorktreesRepository(refusedTasks);

/**
 * Returns the names of the references below `prefix` in the main checkout of `repository`, one per line.
 */
const references = async (prefix: string): Promise<string> =>
  testGit(repository().checkout, 'for-each-ref', '--format=%(refname)', prefix);

describe('deleteTicket', () => {
  it('removes the worktree, the branch and the fork point of a ticket whose work landed', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(4), testTicket(1), 'main');
    const deleted = await worktrees.deleteTicket(testTask(4), testTicket(1), false);
    assert.deepEqual(deleted, {
      worktrees: [created.ticket.path],
      branches: [testTicketBranch(4, 1)],
      stoppedProcesses: [],
      warnings: [],
    });
    assert.equal(await testPathExists(created.ticket.path), false);
    assert.equal(await testPathExists(created.task.path), true);
    assert.equal(await references('refs/heads/atomic-workflow/4-cache-layer/'), `refs/heads/${testTaskBranch(4)}`);
    assert.equal(await references('refs/atomic-workflow/fork-points/4-cache-layer/'), '');
  });

  it('removes nothing without an error for a ticket without a worktree or a branch', async () => {
    assert.deepEqual(await repository().worktrees.deleteTicket(testTask(9), testTicket(1), false), NOTHING_DELETED);
  });

  it('rejects with not-allowed when the ticket branch holds commits that the task branch lacks', async () => {
    await assert.rejects(
      repository().worktrees.deleteTicket(testTask(1), testTicket(1), false),
      testRefusal('not-allowed', /atomic-workflow\/1-cache-layer\/1-add-cache hold commits that .* lacks/),
    );
  });

  it('rejects with not-allowed when the worktree of the ticket has changes that no commit holds', async () => {
    await assert.rejects(
      repository().worktrees.deleteTicket(testTask(2), testTicket(1), false),
      testRefusal('not-allowed', /has changes that no commit holds: \?\? scratch\.txt/),
    );
  });

  it('rejects with not-allowed even with force when the main checkout has the ticket branch checked out', async () => {
    const { checkout, worktrees } = repository();
    await testGit(checkout, 'checkout', '--quiet', '-b', testTicketBranch(5, 1));
    try {
      await assert.rejects(
        worktrees.deleteTicket(testTask(5), testTicket(1), true),
        testRefusal(
          'not-allowed',
          /The main checkout .* has the branch atomic-workflow\/5-cache-layer\/1-add-cache checked out/,
        ),
      );
    } finally {
      await testGit(checkout, 'checkout', '--quiet', 'main');
    }
    assert.equal(await references('refs/heads/atomic-workflow/5-cache-layer/'), `refs/heads/${testTicketBranch(5, 1)}`);
  });
});

describe('deleteTask', () => {
  it('removes every worktree and branch of a task whose work landed, with the directory of the task', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(6), testTicket(1), 'main');
    const deleted = await worktrees.deleteTask(testTask(6), 'main', false);
    assert.deepEqual(
      { ...deleted, worktrees: [...deleted.worktrees].sort() },
      {
        worktrees: [created.ticket.path, created.task.path],
        branches: [testTicketBranch(6, 1), testTaskBranch(6)],
        stoppedProcesses: [],
        warnings: [],
      },
    );
    assert.equal(await testPathExists(dirname(created.task.path)), false);
    assert.equal(await references('refs/heads/atomic-workflow/6-cache-layer/'), '');
    assert.equal(await references('refs/atomic-workflow/fork-points/6-cache-layer/'), '');
  });

  it('removes nothing without an error for a task without worktrees or branches', async () => {
    assert.deepEqual(await repository().worktrees.deleteTask(testTask(9), 'main', false), NOTHING_DELETED);
  });

  it('removes a task whose work has not landed with force', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(7), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'unlanded.txt', 'ticket');
    await testCommit(created.task.path, 'task.txt', 'task');
    await writeFile(join(created.task.path, 'scratch.txt'), 'scratch');
    const deleted = await worktrees.deleteTask(testTask(7), null, true);
    assert.deepEqual(deleted.branches, [testTicketBranch(7, 1), testTaskBranch(7)]);
    assert.equal(await testPathExists(dirname(created.task.path)), false);
    assert.equal(await references('refs/heads/atomic-workflow/7-cache-layer/'), '');
  });

  it('rejects with not-allowed when the task branch holds commits that the base branch lacks', async () => {
    await assert.rejects(
      repository().worktrees.deleteTask(testTask(3), 'main', false),
      testRefusal('not-allowed', /atomic-workflow\/3-cache-layer\/main hold commits that main lacks/),
    );
  });

  it('rejects with not-allowed when the base branch is null or does not exist', async () => {
    const { worktrees } = repository();
    for (const baseBranch of [null, 'missing']) {
      await assert.rejects(
        worktrees.deleteTask(testTask(3), baseBranch, false),
        testRefusal('not-allowed', /has no base branch to compare it with/),
      );
    }
  });

  it('rejects with not-allowed when a ticket branch holds commits that the task branch lacks', async () => {
    await assert.rejects(
      repository().worktrees.deleteTask(testTask(1), 'main', false),
      testRefusal('not-allowed', /atomic-workflow\/1-cache-layer\/1-add-cache hold commits that .* lacks/),
    );
  });

  it('rejects with not-allowed when a worktree of the task has changes that no commit holds', async () => {
    await assert.rejects(
      repository().worktrees.deleteTask(testTask(2), 'main', false),
      testRefusal('not-allowed', /has changes that no commit holds: \?\? scratch\.txt/),
    );
  });

  it('rejects with not-allowed even with force when the main checkout has a branch of the task checked out', async () => {
    const { checkout, worktrees } = repository();
    await testGit(checkout, 'checkout', '--quiet', '-b', testTaskBranch(8));
    try {
      await assert.rejects(
        worktrees.deleteTask(testTask(8), 'main', true),
        testRefusal(
          'not-allowed',
          /The main checkout .* has the branch atomic-workflow\/8-cache-layer\/main checked out/,
        ),
      );
    } finally {
      await testGit(checkout, 'checkout', '--quiet', 'main');
    }
  });
});
