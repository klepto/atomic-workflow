import { comparablePath } from './paths.ts';

/**
 * Pattern of the drive at the start of an absolute path of Windows in lower case, such as `c:`.
 */
const WINDOWS_DRIVE = /^([a-z]):/;

/**
 * Process that a stop found running from inside a directory.
 */
export interface FoundProcess {
  /**
   * Identifier of the process.
   */
  readonly pid: number;

  /**
   * Command line of the process.
   */
  readonly commandLine: string;
}

/**
 * Processes that a stop found, by whether they stopped.
 */
export interface StoppedProcesses {
  /**
   * Processes that were stopped, or that ended before the stop reached them.
   */
  readonly stopped: readonly FoundProcess[];

  /**
   * One sentence for each process that could not be stopped, or for a list of the processes that could not be read.
   */
  readonly failures: readonly string[];
}

/**
 * Function that stops every process whose command line names a path inside one of the directories `directories`, such
 * as a dev server or a watcher that runs from a worktree, and returns what it found. The process that calls it is never
 * stopped. A process that cannot be stopped does not keep the others from a stop. Never rejects: each failure is in
 * its result.
 */
export type StopProcessesFunction = (directories: readonly string[]) => Promise<StoppedProcesses>;

/**
 * Returns the processes of `processes` whose command line names a path inside one of the directories `directories`
 * on the platform `platform`, except the process `ownPid`. On `win32`, paths compare without case and with either
 * slash, and a shell of Git Bash writes `C:\work` as `/c/work`, so both forms count.
 */
export const processesInside = (
  processes: readonly FoundProcess[],
  directories: readonly string[],
  platform: NodeJS.Platform,
  ownPid: number,
): FoundProcess[] => {
  const prefixes = directories.flatMap((directory) => prefixesOf(directory, platform));
  return processes.filter(
    ({ pid, commandLine }) =>
      pid !== ownPid && prefixes.some((prefix) => comparableText(commandLine, platform).includes(prefix)),
  );
};

/**
 * Returns the forms of the path of `directory` that a command line holds for a path inside it on the platform
 * `platform`, in the form of `comparableText`, each with a trailing separator.
 */
const prefixesOf = (directory: string, platform: NodeJS.Platform): string[] => {
  if (platform !== 'win32') return [`${comparablePath(directory, platform)}/`];
  const prefix = `${comparablePath(directory, platform)}\\`;
  return [prefix, prefix.replace(WINDOWS_DRIVE, '\\$1')];
};

/**
 * Returns `text` in a form where two spellings of one path compare equal on the platform `platform`: on `win32` in
 * lower case, with backslashes.
 */
const comparableText = (text: string, platform: NodeJS.Platform): string =>
  platform === 'win32' ? text.toLowerCase().replaceAll('/', '\\') : text;
