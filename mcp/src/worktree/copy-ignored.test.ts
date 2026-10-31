import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type CopyFailure,
  type CopyFailures,
  type CopyIgnoredFunction,
  copiedLinkTarget,
  copyFailuresOf,
  copyIgnoredFiles,
  joinFailures,
} from './copy-ignored.ts';
import type { GitOutput, RunGitFunction } from './run-git.ts';

/**
 * Returns the `count` failures `file-1` to `file-<count>`, each with the code `EPERM`.
 */
const failures = (count: number, start = 1): CopyFailure[] =>
  Array.from({ length: count }, (_, index) => ({ path: `file-${start + index}`, code: 'EPERM' }));

/**
 * Returns a `RunGitFunction` that answers each command with `output`.
 */
const answering =
  (output: GitOutput): RunGitFunction =>
  async () =>
    output;

/**
 * Returns a `CopyIgnoredFunction` that copies nothing, records the paths that it is given in `copied`, and returns
 * `result`.
 */
const recordingCopy =
  (copied: (readonly string[])[], result: CopyFailures | undefined = undefined): CopyIgnoredFunction =>
  async (_checkout, _destination, paths) => {
    copied.push(paths);
    return result;
  };

describe('copyIgnoredFiles', () => {
  it('copies each ignored path that git lists, without the trailing slash of a directory', async () => {
    const copied: (readonly string[])[] = [];
    const runGit = answering({ exitCode: 0, stdout: 'node_modules/\0.env\0dist/cache/\0', stderr: '' });
    const result = await copyIgnoredFiles('/work', '/worktree', { runGit, copyIgnored: recordingCopy(copied) });
    assert.equal(result, undefined);
    assert.deepEqual(copied, [['node_modules', '.env', 'dist/cache']]);
  });

  it('returns the failures of the copy', async () => {
    const copied: (readonly string[])[] = [];
    const failed: CopyFailures = { count: 1, first: [{ path: '.env', code: 'EPERM' }] };
    const runGit = answering({ exitCode: 0, stdout: '.env\0', stderr: '' });
    const result = await copyIgnoredFiles('/work', '/worktree', { runGit, copyIgnored: recordingCopy(copied, failed) });
    assert.deepEqual(result, failed);
  });

  it('returns one failure of the path . with the code GIT_FAILED and copies nothing when git fails', async () => {
    const copied: (readonly string[])[] = [];
    const runGit = answering({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' });
    const result = await copyIgnoredFiles('/work', '/worktree', { runGit, copyIgnored: recordingCopy(copied) });
    assert.deepEqual(result, { count: 1, first: [{ path: '.', code: 'GIT_FAILED' }] });
    assert.deepEqual(copied, []);
  });

  it('returns the same failure when git cannot start', async () => {
    const copied: (readonly string[])[] = [];
    const runGit: RunGitFunction = async () => {
      throw new Error('spawn git ENOENT');
    };
    const result = await copyIgnoredFiles('/work', '/worktree', { runGit, copyIgnored: recordingCopy(copied) });
    assert.deepEqual(result, { count: 1, first: [{ path: '.', code: 'GIT_FAILED' }] });
    assert.deepEqual(copied, []);
  });
});

describe('copyFailuresOf', () => {
  it('returns undefined for no failure', () => {
    assert.equal(copyFailuresOf([]), undefined);
  });

  it('counts every failure and names the first 10', () => {
    assert.deepEqual(copyFailuresOf(failures(12)), { count: 12, first: failures(10) });
  });
});

describe('joinFailures', () => {
  it('returns null when neither side has a failure', () => {
    assert.equal(joinFailures(undefined, undefined), null);
  });

  it('returns the side that has failures when the other has none', () => {
    const only: CopyFailures = { count: 1, first: failures(1) };
    assert.equal(joinFailures(only, undefined), only);
    assert.equal(joinFailures(undefined, only), only);
  });

  it('adds the counts and names the first 10 failures of both sides in order', () => {
    const first: CopyFailures = { count: 8, first: failures(8) };
    const second: CopyFailures = { count: 4, first: failures(4, 9) };
    assert.deepEqual(joinFailures(first, second), { count: 12, first: failures(10) });
  });
});

describe('copiedLinkTarget', () => {
  it('keeps a relative target that lies inside the checkout', () => {
    assert.equal(copiedLinkTarget('/work', '/copy', '../lib', '/work/lib', false, 'linux'), '../lib');
  });

  it('moves an absolute target inside the checkout to the same place inside the destination', () => {
    assert.equal(copiedLinkTarget('/work', '/copy', '/work/lib', '/work/lib', false, 'linux'), '/copy/lib');
  });

  it('makes a relative target absolute in the destination when the link needs an absolute one', () => {
    assert.equal(copiedLinkTarget('C:\\work', 'C:\\copy', 'lib', 'C:\\work\\lib', true, 'win32'), 'C:\\copy\\lib');
  });

  it('returns the resolved target of a link that points outside the checkout', () => {
    assert.equal(copiedLinkTarget('/work', '/copy', '../shared', '/shared', false, 'linux'), '/shared');
  });
});
