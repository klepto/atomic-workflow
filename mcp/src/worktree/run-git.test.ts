import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type GitOutput, gitFailure, gitOutput, lastLines } from './run-git.ts';

/**
 * Returns the output of a git command, with an exit code of 0 and no output unless `overrides` says otherwise.
 */
const output = (overrides: Partial<GitOutput>): GitOutput => ({ exitCode: 0, stdout: '', stderr: '', ...overrides });

describe('gitOutput', () => {
  it('returns the trimmed standard output of git that exits with 0', async () => {
    const runGit = async (): Promise<GitOutput> => output({ stdout: '  main\n' });
    assert.equal(await gitOutput('/work', ['branch', '--show-current'], runGit), 'main');
  });

  it('runs git with the directory and the arguments', async () => {
    const calls: [string, readonly string[]][] = [];
    await gitOutput('/work', ['status'], async (directory, commandLine) => {
      calls.push([directory, commandLine]);
      return output({});
    });
    assert.deepEqual(calls, [['/work', ['status']]]);
  });

  it('rejects with the error of gitFailure when git exits with an error', async () => {
    const runGit = async (): Promise<GitOutput> => output({ exitCode: 1, stderr: 'fatal: bad revision' });
    await assert.rejects(gitOutput('C:\\work', ['rev-parse', 'missing'], runGit), {
      message: 'Git rev-parse missing failed in C:/work: fatal: bad revision',
    });
  });
});

describe('gitFailure', () => {
  it('returns an error that names the command line and the directory and quotes the last lines of git', () => {
    const error = gitFailure('/work', ['merge', '--ff-only', 'main'], output({ exitCode: 128, stderr: 'fatal: no' }));
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Git merge --ff-only main failed in /work: fatal: no');
  });
});

describe('lastLines', () => {
  it('joins the last five lines that are not blank, the standard error before the standard output', () => {
    const stderr = 'one\r\n\r\ntwo\nthree\n';
    const stdout = 'four\n  \nfive\nsix\n';
    assert.equal(lastLines(output({ exitCode: 1, stderr, stdout })), 'two three four five six');
  });

  it('returns the exit code when git printed nothing', () => {
    assert.equal(lastLines(output({ exitCode: 128 })), 'exit code 128');
  });
});
