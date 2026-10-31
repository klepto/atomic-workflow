import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  testCommit,
  testGit,
  testPathExists,
  testRefusal,
  testStoppedRebase,
  testTask,
  testTaskBranch,
  testTicket,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { WorktreeError } from './worktree-error.ts';

/**
 * Message of the commit of each ticket that lands in a test.
 */
const MESSAGE = 'feat: add the cache\n\nAdds the cache layer.';

describe('merge', () => {
  const repository = testWorktreesRepository();

  it('squashes the commits of the ticket into one commit with the trailers at the tip of the task branch', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(1), testTicket(1), 'main');
    const start = await testGit(checkout, 'rev-parse', 'main');
    await testCommit(created.ticket.path, 'first.txt', 'first');
    await testCommit(created.ticket.path, 'second.txt', 'second');
    const merged = await worktrees.merge(testTask(1), testTicket(1), `${MESSAGE}\n`);
    assert.deepEqual(merged, {
      taskBranch: testTaskBranch(1),
      commit: await testGit(checkout, 'rev-parse', testTaskBranch(1)),
    });
    const commit = merged.commit ?? '';
    assert.equal(
      await testGit(checkout, 'log', '-1', '--format=%P%n%B', commit),
      `${start}\n${MESSAGE}\n\nAtomic-Workflow-Task: 1-cache-layer\nAtomic-Workflow-Ticket: 1-add-cache`,
    );
    assert.equal(await testGit(checkout, 'show', '--name-only', '--format=', commit), 'first.txt\nsecond.txt');
    assert.equal(await testPathExists(join(created.task.path, 'second.txt')), true);
  });

  it('rejects with conflict and leaves the rebase stopped in the worktree of the ticket when the rebase stops', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(2), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'same.txt', 'ticket');
    await testCommit(created.task.path, 'same.txt', 'task');
    await assert.rejects(worktrees.merge(testTask(2), testTicket(1), MESSAGE), (error) => {
      testRefusal('conflict', /same\.txt/)(error);
      assert.ok(error instanceof WorktreeError);
      assert.deepEqual(error.files, ['same.txt']);
      return true;
    });
    const rebaseDirectory = await testGit(
      created.ticket.path,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'rebase-merge',
    );
    assert.equal(await testPathExists(rebaseDirectory), true);
  });

  it('rejects with not-allowed when the ticket has no worktree', async () => {
    await assert.rejects(
      repository().worktrees.merge(testTask(3), testTicket(1), MESSAGE),
      testRefusal('not-allowed', /Create the worktree of the ticket first/),
    );
  });

  it('rejects with not-allowed when the worktree of the ticket has changes that no commit holds', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(4), testTicket(1), 'main');
    await writeFile(join(created.ticket.path, 'scratch.txt'), 'scratch');
    await assert.rejects(
      worktrees.merge(testTask(4), testTicket(1), MESSAGE),
      testRefusal('not-allowed', /has changes that no commit holds: \?\? scratch\.txt/),
    );
  });

  it('rejects with not-allowed when the worktree of the task has a stopped rebase', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(5), testTicket(1), 'main');
    await testStoppedRebase(created.task.path, 'side.txt');
    await assert.rejects(
      worktrees.merge(testTask(5), testTicket(1), MESSAGE),
      testRefusal('not-allowed', /of the task branch .* has a stopped rebase/),
    );
  });

  it('rejects with not-allowed when the task branch cannot move forward to the commit of the ticket', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(6), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'blocked.txt', 'ticket');
    await writeFile(join(created.task.path, 'blocked.txt'), 'untracked');
    await assert.rejects(
      worktrees.merge(testTask(6), testTicket(1), MESSAGE),
      testRefusal('not-allowed', /Git refused to move atomic-workflow\/6-cache-layer\/main forward/),
    );
  });

  it('returns the landed commit again with no move once the ticket landed, after its worktree is gone too', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(7), testTicket(1), 'main');
    await testCommit(created.ticket.path, 'landed.txt', 'ticket');
    const first = await worktrees.merge(testTask(7), testTicket(1), MESSAGE);
    await testCommit(created.task.path, 'later.txt', 'later ticket');
    const tip = await testGit(checkout, 'rev-parse', testTaskBranch(7));
    assert.deepEqual(await worktrees.merge(testTask(7), testTicket(1), MESSAGE), first);
    await worktrees.deleteTicket(testTask(7), testTicket(1), false);
    assert.deepEqual(await worktrees.merge(testTask(7), testTicket(1), MESSAGE), first);
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(7)), tip);
  });

  it('lands nothing and returns no commit when the commits of the ticket change nothing', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(8), testTicket(1), 'main');
    const start = await testGit(checkout, 'rev-parse', testTaskBranch(8));
    await testCommit(created.ticket.path, 'README.md', 'changed');
    await testCommit(created.ticket.path, 'README.md', '# Test\n');
    assert.deepEqual(await worktrees.merge(testTask(8), testTicket(1), MESSAGE), {
      taskBranch: testTaskBranch(8),
      commit: null,
    });
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(8)), start);
    assert.equal(await testGit(created.ticket.path, 'status', '--porcelain'), '');
  });
});
