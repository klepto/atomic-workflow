import assert from 'node:assert/strict';
import { access, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { describe, it } from 'node:test';
import { processRunGit } from '../worktree/run-git.process.ts';
import { gitOutput } from '../worktree/run-git.ts';
import { testGitRepository } from './test-git-repository.ts';

/**
 * Returns whether a file or a directory exists at `path`.
 */
const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

describe('testGitRepository', () => {
  let passedDirectory = '';

  it('returns the absolute real path of a repository on main with one commit of a local user', async (context) => {
    passedDirectory = await testGitRepository(context);
    assert.equal(isAbsolute(passedDirectory), true);
    assert.equal(await realpath(passedDirectory), passedDirectory);
    assert.equal(await gitOutput(passedDirectory, ['branch', '--show-current'], processRunGit), 'main');
    assert.equal(
      await gitOutput(passedDirectory, ['log', '--format=%an <%ae> %s'], processRunGit),
      'Test <test@example.com> Initial commit',
    );
  });

  it('removes the directory once a test that passed ends', async () => {
    assert.equal(await exists(passedDirectory), false);
  });

  it('registers the removal with after of any cleanup, which removes the directory whether the test passes or fails', async () => {
    const hooks: (() => Promise<void>)[] = [];
    // A cleanup that only records its hooks, so the test runs them itself, as a suite hook does after a failure.
    const directory = await testGitRepository({ after: (hook) => hooks.push(hook) });
    assert.equal(await exists(directory), true);
    for (const hook of hooks) await hook();
    assert.equal(await exists(directory), false);
  });

  it('writes a local user and no signing of commits to the configuration of the repository', async (context) => {
    const directory = await testGitRepository(context);
    const settings = await gitOutput(
      directory,
      ['config', '--local', '--get-regexp', '^(user|commit)[.]'],
      processRunGit,
    );
    assert.equal(settings, 'user.name Test\nuser.email test@example.com\ncommit.gpgsign false');
  });
});
