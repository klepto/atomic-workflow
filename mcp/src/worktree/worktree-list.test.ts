import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import type { GitOutput, RunGitFunction } from './run-git.ts';
import { findMainWorktree, listWorktrees } from './worktree-list.ts';

/**
 * Output of `git worktree list --porcelain` for a main checkout on `main`, a worktree of a task branch, and a worktree
 * with a detached `HEAD`, with the line ends of Windows.
 */
const PORCELAIN = [
  'worktree C:/work/repository',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree C:/home/.atomic-workflow/worktrees/repository-12345678/1-cache-layer/main',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/atomic-workflow/1-cache-layer/main',
  '',
  'worktree C:/home/.atomic-workflow/worktrees/repository-12345678/1-cache-layer/1-add-cache',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  '',
].join('\r\n');

/**
 * Returns a `RunGitFunction` that answers each command with `output`, and records each command line in `commandLines`.
 */
const answering =
  (output: GitOutput, commandLines: (readonly string[])[] = []): RunGitFunction =>
  async (_directory, commandLine) => {
    commandLines.push(commandLine);
    return output;
  };

describe('listWorktrees', () => {
  it('returns each worktree with its absolute path and its branch, the main worktree first', async () => {
    const commandLines: (readonly string[])[] = [];
    const runGit = answering({ exitCode: 0, stdout: PORCELAIN, stderr: '' }, commandLines);
    assert.deepEqual(await listWorktrees('/work/repository', runGit), [
      { path: resolve('C:/work/repository'), branch: 'main' },
      {
        path: resolve('C:/home/.atomic-workflow/worktrees/repository-12345678/1-cache-layer/main'),
        branch: 'atomic-workflow/1-cache-layer/main',
      },
      {
        path: resolve('C:/home/.atomic-workflow/worktrees/repository-12345678/1-cache-layer/1-add-cache'),
        branch: undefined,
      },
    ]);
    assert.deepEqual(commandLines, [['worktree', 'list', '--porcelain']]);
  });

  it('rejects with the last lines of git when git fails', async () => {
    const runGit = answering({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' });
    await assert.rejects(listWorktrees('/work/repository', runGit), {
      message: 'Git worktree list --porcelain failed in /work/repository: fatal: not a git repository',
    });
  });
});

describe('findMainWorktree', () => {
  it('returns the path of the first worktree that git lists', async () => {
    const runGit = answering({ exitCode: 0, stdout: PORCELAIN, stderr: '' });
    assert.equal(await findMainWorktree('/work/repository', runGit), resolve('C:/work/repository'));
  });

  it('rejects when git lists no worktree', async () => {
    const runGit = answering({ exitCode: 0, stdout: '', stderr: '' });
    await assert.rejects(findMainWorktree('C:\\work\\repository', runGit), {
      message: 'Git listed no worktree for C:/work/repository',
    });
  });
});
