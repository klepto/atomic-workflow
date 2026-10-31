import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  testCandidate,
  testCommit,
  testDivergedTask,
  testGit,
  testPathExists,
  testRefusal,
  testStoppedRebase,
  testTask,
  testTaskBranch,
  testTicket,
  testTicketBranch,
  testWorktrees,
  testWorktreesRepository,
} from '../testing/test-worktrees.ts';
import { forwardSlashes } from './paths.ts';
import { processRunGit } from './run-git.process.ts';
import { WorktreeError } from './worktree-error.ts';

/**
 * Output of a check that failed, longer than the lines that a warning quotes.
 */
const CHECK_OUTPUT = 'line 1\nline 2\n\nline 3\nline 4\nline 5\nline 6\nline 7\n';

/**
 * Warning of a sync whose branches moved while the checks of its candidate ran.
 */
const MOVED_WARNING =
  'The task branch or the base branch moved while the checks ran, so the task branch was not synced with main';

/**
 * Returns whether the branch `branch` exists in the repository of the main checkout `checkout`.
 */
const branchExists = async (checkout: string, branch: string): Promise<boolean> =>
  (await processRunGit(checkout, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).exitCode === 0;

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
  it('rejects with needs-checks, makes no ticket branch and leaves the task branch where it is when both branches have commits that the other lacks', async () => {
    const { checkout, worktrees } = repository();
    const created = await testDivergedTask(repository(), 11);
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(11));
    const candidate = await testCandidate(worktrees.create(testTask(11), testTicket(2), 'main'));
    assert.equal(candidate.worktree, created.task.path);
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(11)), taskTip);
    assert.equal(await testGit(candidate.worktree, 'rev-parse', 'HEAD'), candidate.commit);
    assert.equal(
      await testGit(checkout, 'rev-parse', `${candidate.commit}~1`),
      await testGit(checkout, 'rev-parse', 'main'),
    );
    assert.deepEqual(
      [
        await readFile(join(candidate.worktree, 'task-11.txt'), 'utf8'),
        await readFile(join(candidate.worktree, 'base-11.txt'), 'utf8'),
      ],
      ['task', 'base'],
    );
    assert.equal(await branchExists(checkout, testTicketBranch(11, 2)), false);
  });

  it('moves the task branch to the candidate and makes the ticket branch from it when the checks passed', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 12);
    const candidate = await testCandidate(worktrees.create(testTask(12), testTicket(2), 'main'));
    const created = await worktrees.create(testTask(12), testTicket(2), 'main', {
      commit: candidate.commit,
      failure: null,
    });
    assert.deepEqual({ synced: created.taskBranchSynced, warnings: created.warnings }, { synced: true, warnings: [] });
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(12)), candidate.commit);
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), candidate.commit);
    assert.equal(await testGit(created.task.path, 'branch', '--show-current'), testTaskBranch(12));
  });

  it('drops the candidate and makes the ticket branch from the task branch with a warning when a check failed', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 13);
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(13));
    const candidate = await testCandidate(worktrees.create(testTask(13), testTicket(2), 'main'));
    const created = await worktrees.create(testTask(13), testTicket(2), 'main', {
      commit: candidate.commit,
      failure: { command: 'npm test', output: CHECK_OUTPUT },
    });
    assert.deepEqual(
      { synced: created.taskBranchSynced, warnings: created.warnings },
      {
        synced: false,
        warnings: [
          `The check npm test failed on the candidate ${candidate.commit}, so the task branch was not synced with main: line 3 line 4 line 5 line 6 line 7`,
        ],
      },
    );
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(13)), taskTip);
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), taskTip);
    assert.equal(await testGit(created.task.path, 'branch', '--show-current'), testTaskBranch(13));
    assert.equal(await testPathExists(join(created.task.path, 'base-13.txt')), false);
  });

  it('drops the candidate with a warning when the base branch moved while the checks ran', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 14);
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(14));
    const candidate = await testCandidate(worktrees.create(testTask(14), testTicket(2), 'main'));
    await testCommit(checkout, 'moved-14.txt', 'moved');
    const created = await worktrees.create(testTask(14), testTicket(2), 'main', {
      commit: candidate.commit,
      failure: null,
    });
    assert.deepEqual(
      { synced: created.taskBranchSynced, warnings: created.warnings },
      { synced: false, warnings: [MOVED_WARNING] },
    );
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(14)), taskTip);
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), taskTip);
  });

  it('lands a ticket on the task branch while a candidate waits, and then drops the candidate with a warning', async () => {
    const { checkout, worktrees } = repository();
    const first = await testDivergedTask(repository(), 15);
    const candidate = await testCandidate(worktrees.create(testTask(15), testTicket(2), 'main'));
    await testCommit(first.ticket.path, 'cache.txt', 'cache');
    const merged = await worktrees.merge(testTask(15), testTicket(1), 'feat: add the cache');
    const created = await worktrees.create(testTask(15), testTicket(2), 'main', {
      commit: candidate.commit,
      failure: null,
    });
    assert.deepEqual(created.warnings, [MOVED_WARNING]);
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(15)), merged.commit);
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), merged.commit);
  });

  it('rejects with needs-checks once a sync that stopped on a conflict continues, and leaves the task branch where it is', async () => {
    const { checkout, worktrees } = repository();
    const created = await worktrees.create(testTask(16), testTicket(1), 'main');
    await testCommit(created.task.path, 'conflict-16.txt', 'task');
    await testCommit(checkout, 'conflict-16.txt', 'base');
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(16));
    await assert.rejects(
      worktrees.create(testTask(16), testTicket(2), 'main'),
      testRefusal('conflict', /conflict-16\.txt/),
    );
    await writeFile(join(created.task.path, 'conflict-16.txt'), 'both');
    await testGit(created.task.path, 'add', 'conflict-16.txt');
    const candidate = await testCandidate(worktrees.create(testTask(16), testTicket(2), 'main'));
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(16)), taskTip);
    assert.equal(await testGit(checkout, 'show', `${candidate.commit}:conflict-16.txt`), 'both');
  });

  it('moves the task branch forward with no checks when the base branch holds it', async () => {
    const { checkout, worktrees } = repository();
    await worktrees.create(testTask(17), testTicket(1), 'main');
    await testCommit(checkout, 'forward-17.txt', 'base');
    const created = await worktrees.create(testTask(17), testTicket(2), 'main');
    assert.equal(created.taskBranchSynced, true);
    assert.equal(
      await testGit(checkout, 'rev-parse', testTaskBranch(17)),
      await testGit(checkout, 'rev-parse', 'main'),
    );
  });

  it('leaves the task branch as it is with no checks when it holds the base branch', async () => {
    const { checkout, worktrees } = repository();
    const first = await worktrees.create(testTask(18), testTicket(1), 'main');
    await testCommit(first.task.path, 'task-18.txt', 'task');
    const taskTip = await testGit(checkout, 'rev-parse', testTaskBranch(18));
    const created = await worktrees.create(testTask(18), testTicket(2), 'main');
    assert.deepEqual({ synced: created.taskBranchSynced, warnings: created.warnings }, { synced: false, warnings: [] });
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), taskTip);
  });

  it('rejects with needs-checks for the same candidate after a restart while both branches stayed', async () => {
    const { checkout, home, worktrees } = repository();
    await testDivergedTask(repository(), 19);
    const candidate = await testCandidate(worktrees.create(testTask(19), testTicket(2), 'main'));
    const restarted = testWorktrees(checkout, home);
    assert.deepEqual(await testCandidate(restarted.create(testTask(19), testTicket(2), 'main')), candidate);
  });

  it('rejects with invalid-checks and makes no ticket branch when checks name no candidate', async () => {
    const { checkout, worktrees } = repository();
    await worktrees.create(testTask(20), testTicket(1), 'main');
    await assert.rejects(
      worktrees.create(testTask(20), testTicket(2), 'main', { commit: 'f'.repeat(40), failure: null }),
      testRefusal('invalid-checks', /is no candidate of atomic-workflow\/20-cache-layer\/main/),
    );
    assert.equal(await branchExists(checkout, testTicketBranch(20, 2)), false);
  });

  it('resumes a ticket whose branch exists while a candidate waits, and keeps the candidate', async () => {
    const { worktrees } = repository();
    await testDivergedTask(repository(), 21);
    const candidate = await testCandidate(worktrees.create(testTask(21), testTicket(2), 'main'));
    const resumed = await worktrees.create(testTask(21), testTicket(1), 'main');
    assert.deepEqual({ synced: resumed.taskBranchSynced, warnings: resumed.warnings }, { synced: false, warnings: [] });
    assert.deepEqual(await testCandidate(worktrees.create(testTask(21), testTicket(2), 'main')), candidate);
  });

  it('syncs again with the checks of a candidate that the task branch moved to already', async () => {
    const { checkout, worktrees } = repository();
    await testDivergedTask(repository(), 22);
    const candidate = await testCandidate(worktrees.create(testTask(22), testTicket(2), 'main'));
    const checks = { commit: candidate.commit, failure: null };
    await worktrees.create(testTask(22), testTicket(2), 'main', checks);
    const created = await worktrees.create(testTask(22), testTicket(3), 'main', checks);
    assert.equal(created.taskBranchSynced, true);
    assert.equal(await testGit(checkout, 'rev-parse', testTaskBranch(22)), candidate.commit);
    assert.equal(await testGit(created.ticket.path, 'rev-parse', 'HEAD'), candidate.commit);
  });
});
