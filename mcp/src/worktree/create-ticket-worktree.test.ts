import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  testCommit,
  testGit,
  testRefusal,
  testStoppedRebase,
  testTask,
  testTaskBranch,
  testTicket,
  testTicketBranch,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { forwardSlashes } from './paths.ts';
import { processRunGit } from './run-git.process.ts';
import { WorktreeError } from './worktree-error.ts';

describe('create', () => {
  const repository = testWorktreesRepository();

  it('makes the task branch from the base branch and the ticket branch from it, each in a worktree below the home', async () => {
    const { checkout, home, worktrees } = repository();
    await writeFile(join(checkout, '.git', 'info', 'exclude'), '/.env\n');
    await writeFile(join(checkout, '.env'), 'KEY=value\n');
    await writeFile(join(checkout, 'README.md'), '# Changed\n');
    const baseTip = await testGit(checkout, 'rev-parse', 'main');
    const created = await worktrees.create(testTask(1), testTicket(1), 'main');
    await testGit(checkout, 'checkout', '--', 'README.md');
    const repositoryDirectory = dirname(dirname(created.task.path));
    assert.equal(dirname(repositoryDirectory), `${forwardSlashes(home)}/.atomic-workflow/worktrees`);
    assert.match(basename(repositoryDirectory), new RegExp(`^${basename(checkout)}-[0-9a-f]{8}$`));
    assert.deepEqual(created, {
      task: { path: `${repositoryDirectory}/1-cache-layer/main`, branch: testTaskBranch(1) },
      ticket: { path: `${repositoryDirectory}/1-cache-layer/1-add-cache`, branch: testTicketBranch(1, 1) },
      baseBranch: 'main',
      taskBranchCreated: true,
      ticketBranchCreated: true,
      taskBranchSynced: false,
      uncommittedChanges: true,
      copyFailures: null,
      warnings: [],
    });
    for (const place of [created.task, created.ticket]) {
      assert.equal(
        await testGit(place.path, 'rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'),
        `${baseTip}\n${place.branch}`,
      );
    }
    assert.equal(await readFile(join(created.task.path, '.env'), 'utf8'), 'KEY=value\n');
    assert.equal(await readFile(join(created.ticket.path, '.env'), 'utf8'), 'KEY=value\n');
  });

  it('rejects with conflict and makes no ticket branch when the sync with the base branch stops on a conflict', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(2), testTicket(1), 'main');
    await testCommit(created.task.path, 'conflict.txt', 'task');
    await testCommit(checkout, 'conflict.txt', 'base');
    await assert.rejects(worktrees.create(testTask(2), testTicket(2), 'main'), (error) => {
      testRefusal('conflict', /conflict\.txt/)(error);
      assert.ok(error instanceof WorktreeError);
      assert.deepEqual(error.files, ['conflict.txt']);
      return true;
    });
    const ticketBranch = await processRunGit(checkout, ['rev-parse', '--verify', '--quiet', testTicketBranch(2, 2)]);
    assert.notEqual(ticketBranch.exitCode, 0);
  });

  it('rejects with not-allowed when the base branch is null and the main checkout has no branch checked out', async () => {
    const { checkout, worktrees } = repository();
    await testGit(checkout, 'checkout', '--quiet', '--detach');
    try {
      await assert.rejects(
        worktrees.create(testTask(3), testTicket(1), null),
        testRefusal('not-allowed', /has no branch checked out/),
      );
    } finally {
      await testGit(checkout, 'checkout', '--quiet', 'main');
    }
  });

  it('rejects with not-allowed when the worktree of the task has a stopped rebase that is no sync', async () => {
    const { worktrees } = repository();
    const created = await worktrees.create(testTask(4), testTicket(1), 'main');
    await testStoppedRebase(created.task.path, 'side.txt');
    await assert.rejects(
      worktrees.create(testTask(4), testTicket(2), 'main'),
      testRefusal('not-allowed', /has a stopped rebase that is no sync/),
    );
  });

  it('rejects with not-allowed when git refuses to make the ticket branch', async () => {
    await assert.rejects(
      repository().worktrees.create(testTask(1), { id: 2, slug: 'bad..slug' }, 'main'),
      testRefusal('not-allowed', /Git refused to make the branch/),
    );
  });
});
