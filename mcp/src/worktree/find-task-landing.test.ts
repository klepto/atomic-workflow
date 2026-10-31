import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  testCommit,
  testGit,
  testLandedTicket,
  testTask,
  testTaskBranch,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';

describe('taskLanding', () => {
  const repository = testWorktreesRepository();

  it('returns the latest commit of the task on the base branch', async () => {
    const { checkout, worktrees } = repository();
    await testLandedTicket(repository(), 1);
    await testGit(checkout, 'merge', '--ff-only', '--quiet', testTaskBranch(1));
    const landed = await testGit(checkout, 'rev-parse', 'main');
    await testCommit(checkout, 'later.txt', 'later');
    assert.equal(await worktrees.taskLanding(testTask(1), 'main'), landed);
  });

  it('returns undefined for a task whose commits the base branch lacks', async () => {
    const { worktrees } = repository();
    await testLandedTicket(repository(), 2);
    assert.equal(await worktrees.taskLanding(testTask(2), 'main'), undefined);
  });

  it('returns undefined when the base branch does not exist', async () => {
    assert.equal(await repository().worktrees.taskLanding(testTask(1), 'missing'), undefined);
  });
});
