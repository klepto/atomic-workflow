import assert from 'node:assert/strict';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  branchRef,
  forkPointRefOf,
  layoutOf,
  shown,
  taskBranchesRef,
  taskBranchOf,
  taskDirectory,
  taskPlaceOf,
  ticketPlaceOf,
} from './worktree-layout.ts';
import type { WorkName } from './worktrees.ts';

/**
 * Task of the tests.
 */
const TASK: WorkName = { id: 3, slug: 'cache-layer' };

/**
 * Ticket of the tests.
 */
const TICKET: WorkName = { id: 2, slug: 'add-cache' };

/**
 * Places of the worktrees of the repository `/work/repository` in the home `/home/user` on Linux.
 */
const LAYOUT = layoutOf('/work/repository', '/home/user', 'linux');

describe('layoutOf', () => {
  it('keeps the worktrees in a directory of the home named for the main checkout and a hash of its path', () => {
    assert.equal(LAYOUT.checkout, '/work/repository');
    assert.equal(dirname(LAYOUT.root), join('/home/user', '.atomic-workflow', 'worktrees'));
    assert.match(basename(LAYOUT.root), /^repository-[0-9a-f]{8}$/);
  });

  it('gives the same hash to two spellings of one main checkout on win32', () => {
    const first = layoutOf('C:\\Work\\Repository', '/home/user', 'win32');
    const second = layoutOf('c:/work/repository/', '/home/user', 'win32');
    assert.equal(basename(first.root).slice(-8), basename(second.root).slice(-8));
  });

  it('gives different directories to two main checkouts with the same name', () => {
    const other = layoutOf('/other/repository', '/home/user', 'linux');
    assert.notEqual(other.root, LAYOUT.root);
  });
});

describe('branchRef', () => {
  it('returns the reference of the branch', () => {
    assert.equal(branchRef('main'), 'refs/heads/main');
  });
});

describe('taskDirectory', () => {
  it('returns the directory of the task below the root of the layout', () => {
    assert.equal(taskDirectory(LAYOUT, TASK), join(LAYOUT.root, '3-cache-layer'));
  });
});

describe('taskBranchOf', () => {
  it('returns the task branch of the task', () => {
    assert.equal(taskBranchOf(TASK), 'atomic-workflow/3-cache-layer/main');
  });
});

describe('taskBranchesRef', () => {
  it('returns the start of the reference of every branch of the task, with a trailing slash', () => {
    assert.equal(taskBranchesRef(TASK), 'refs/heads/atomic-workflow/3-cache-layer/');
  });
});

describe('taskPlaceOf', () => {
  it('returns the worktree main in the directory of the task, with the task branch', () => {
    assert.deepEqual(taskPlaceOf(LAYOUT, TASK), {
      path: join(LAYOUT.root, '3-cache-layer', 'main'),
      branch: 'atomic-workflow/3-cache-layer/main',
    });
  });
});

describe('ticketPlaceOf', () => {
  it('returns the worktree of the ticket in the directory of the task, with the ticket branch', () => {
    assert.deepEqual(ticketPlaceOf(LAYOUT, TASK, TICKET), {
      path: join(LAYOUT.root, '3-cache-layer', '2-add-cache'),
      branch: 'atomic-workflow/3-cache-layer/2-add-cache',
    });
  });
});

describe('shown', () => {
  it('returns the place with its path in forward slashes', () => {
    assert.deepEqual(shown({ path: 'C:\\work\\main', branch: 'main' }), { path: 'C:/work/main', branch: 'main' });
  });
});

describe('forkPointRefOf', () => {
  it('returns the reference of the fork point of the ticket branch', () => {
    assert.equal(
      forkPointRefOf('atomic-workflow/3-cache-layer/2-add-cache'),
      'refs/atomic-workflow/fork-points/3-cache-layer/2-add-cache',
    );
  });
});
