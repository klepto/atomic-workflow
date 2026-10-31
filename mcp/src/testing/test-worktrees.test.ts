import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { processRunGit } from '../worktree/run-git.process.ts';
import type { RunGitFunction } from '../worktree/run-git.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import {
  type TestWorktreesRepository,
  testCommit,
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
} from './test-worktrees.ts';

/**
 * Main checkout of the repository of the suite of `testWorktreesRepository`, which the suite after it checks.
 */
let sharedCheckout = '';

/**
 * Writes the file `set-up.txt` in the main checkout of `repository`, so a test sees that the set-up ran.
 */
const writeMarker = async ({ checkout }: TestWorktreesRepository): Promise<void> => {
  await writeFile(join(checkout, 'set-up.txt'), 'set up');
};

/**
 * Repository that the suites of the other helpers share, in the order of the file: the rebase that
 * `testStoppedRebase` leaves stopped comes last.
 */
const shared = testWorktreesRepository();

describe('testWorktreesRepository', () => {
  const repository = testWorktreesRepository(writeMarker);

  it('returns a repository on main with a home below its main checkout, after the set-up ran', async () => {
    const { checkout, home } = repository();
    sharedCheckout = checkout;
    assert.equal(await testGit(checkout, 'branch', '--show-current'), 'main');
    assert.equal(home, join(checkout, 'home'));
    assert.equal(await testPathExists(join(checkout, 'set-up.txt')), true);
  });

  it('returns Worktrees that keep their worktrees below the home', async () => {
    const { home, worktrees } = repository();
    const created = await worktrees.create(testTask(1), testTicket(1), 'main');
    assert.ok(created.task.path.startsWith(`${home.replaceAll('\\', '/')}/`));
    assert.equal(await testPathExists(created.ticket.path), true);
  });
});

describe('testWorktreesRepository after its suite', () => {
  it('removes the repository with its worktrees once the suite ends', async () => {
    assert.notEqual(sharedCheckout, '');
    assert.equal(await testPathExists(sharedCheckout), false);
  });
});

describe('testWorktrees', () => {
  it('returns Worktrees that run git with the given function', async () => {
    const { checkout, home } = shared();
    const commandLines: (readonly string[])[] = [];
    const runGit: RunGitFunction = async (directory, commandLine) => {
      commandLines.push(commandLine);
      return processRunGit(directory, commandLine);
    };
    assert.deepEqual(await testWorktrees(checkout, home, runGit).unlandedTickets(testTask(1), 'main'), []);
    assert.notEqual(commandLines.length, 0);
  });
});

describe('testCommit', () => {
  it('writes the file and commits it in the worktree', async () => {
    const { checkout } = shared();
    await testCommit(checkout, 'cache.txt', 'cache');
    assert.equal(await testGit(checkout, 'show', 'HEAD:cache.txt'), 'cache');
    assert.equal(await testGit(checkout, 'status', '--porcelain'), '');
  });
});

describe('testStoppedRebase', () => {
  it('leaves a rebase stopped on a conflict in the file', async () => {
    const { checkout } = shared();
    await testStoppedRebase(checkout, 'side.txt');
    assert.equal(await testGit(checkout, 'diff', '--name-only', '--diff-filter=U'), 'side.txt');
  });
});

describe('testTask', () => {
  it('returns the task with the slug cache-layer and its branches', () => {
    assert.deepEqual(testTask(3), { id: 3, slug: 'cache-layer' });
    assert.equal(testTaskBranch(3), 'atomic-workflow/3-cache-layer/main');
  });
});

describe('testTicket', () => {
  it('returns the ticket with the slug add-cache and its branch', () => {
    assert.deepEqual(testTicket(2), { id: 2, slug: 'add-cache' });
    assert.equal(testTicketBranch(3, 2), 'atomic-workflow/3-cache-layer/2-add-cache');
  });
});

describe('testPathExists', () => {
  it('returns whether something exists at the path', async () => {
    assert.equal(await testPathExists(import.meta.dirname), true);
    assert.equal(await testPathExists(join(import.meta.dirname, 'missing')), false);
  });
});

describe('testRefusal', () => {
  it('accepts a WorktreeError of the kind whose message matches', () => {
    assert.equal(testRefusal('conflict', /same\.txt/)(new WorktreeError('conflict', 'Conflict in same.txt')), true);
  });

  it('fails for another kind, another message or an error that is no WorktreeError', () => {
    const accepts = testRefusal('conflict', /same\.txt/);
    assert.throws(() => accepts(new WorktreeError('not-allowed', 'Conflict in same.txt')), assert.AssertionError);
    assert.throws(() => accepts(new WorktreeError('conflict', 'Conflict in other.txt')), assert.AssertionError);
    assert.throws(() => accepts(new Error('Conflict in same.txt')), assert.AssertionError);
  });
});
