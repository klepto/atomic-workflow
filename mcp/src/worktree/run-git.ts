import { forwardSlashes } from './paths.ts';

/**
 * Number of the lines of git that a message quotes.
 */
export const QUOTED_LINE_COUNT = 5;

/**
 * Output of a git command that ran to its end.
 */
export interface GitOutput {
  /**
   * Exit code of git.
   */
  readonly exitCode: number;

  /**
   * Standard output of git.
   */
  readonly stdout: string;

  /**
   * Standard error of git.
   */
  readonly stderr: string;
}

/**
 * Function that runs git with the arguments `commandLine` in the directory `directory`, with `input` on its standard
 * input when given, and returns its output, whatever its exit code. Git opens no editor and asks for no credentials.
 * If git cannot start, such as for a missing git program or a missing directory, rejects with the error of the start.
 */
export type RunGitFunction = (directory: string, commandLine: readonly string[], input?: string) => Promise<GitOutput>;

/**
 * Returns the trimmed standard output of git with the arguments `commandLine` in `directory`, run with `runGit`.
 * If git exits with an error, rejects with the error of `gitFailure`.
 */
export const gitOutput = async (
  directory: string,
  commandLine: readonly string[],
  runGit: RunGitFunction,
): Promise<string> => {
  const output = await runGit(directory, commandLine);
  if (output.exitCode === 0) return output.stdout.trim();
  throw gitFailure(directory, commandLine, output);
};

/**
 * Returns the error of git with the arguments `commandLine` in `directory`, which printed `output` and exited with an
 * error. Its message quotes the last lines of git.
 */
export const gitFailure = (directory: string, commandLine: readonly string[], output: GitOutput): Error =>
  new Error(`Git ${commandLine.join(' ')} failed in ${forwardSlashes(directory)}: ${lastLines(output)}`);

/**
 * Returns the last lines that git printed in `output`, on one line. If git printed nothing, returns its exit code
 * instead.
 */
export const lastLines = (output: GitOutput): string =>
  lastLinesOf(`${output.stderr}\n${output.stdout}`) || `exit code ${output.exitCode}`;

/**
 * Returns the last `QUOTED_LINE_COUNT` lines of `text` that are not blank, on one line, or an empty string when it has
 * none.
 */
export const lastLinesOf = (text: string): string =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-QUOTED_LINE_COUNT)
    .join(' ');
