import { systemStopProcesses } from './stop-processes.system.ts';

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
 * stopped. A process that cannot be stopped does not keep the others from a stop.
 */
export type StopProcessesFunction = (directories: readonly string[]) => Promise<StoppedProcesses>;

/**
 * Default `StopProcessesFunction`, which lists the processes with `Get-CimInstance` on Windows and with `ps` elsewhere,
 * and stops each one with its children with `taskkill` on Windows and with `SIGTERM` elsewhere.
 */
export const StopProcesses: StopProcessesFunction = systemStopProcesses;
