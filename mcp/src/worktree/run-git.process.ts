import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { errorCode } from './error-details.ts';
import type { RunGitFunction } from './run-git.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Most bytes of the standard output or the standard error of one git command.
 */
const OUTPUT_LIMIT = 64 * 1024 * 1024;

/**
 * `RunGitFunction` that runs the git program of the system as a child process, with no window on Windows.
 */
export const processRunGit: RunGitFunction = async (directory, commandLine, input) => {
  try {
    const run = execFileAsync('git', commandLine, {
      cwd: directory,
      windowsHide: true,
      maxBuffer: OUTPUT_LIMIT,
      env: { ...process.env, GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0' },
    });
    // Git that reads no input never waits for its end, so only a call with input writes it.
    if (input !== undefined) run.child.stdin?.end(input);
    const { stdout, stderr } = await run;
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    if (!isExitError(error)) throw error;
    return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};

/**
 * Returns whether `error` is the error of a git command that ran and exited with an error code, which holds its
 * output.
 */
const isExitError = (error: unknown): error is Error & { code: number; stdout: string; stderr: string } =>
  typeof errorCode(error) === 'number';
