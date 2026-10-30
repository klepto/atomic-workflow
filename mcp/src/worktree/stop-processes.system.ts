import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { errorCode, errorMessage } from './error-details.ts';
import { type FoundProcess, processesInside, type StopProcessesFunction } from './stop-processes.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Command of PowerShell that prints the identifier and the command line of every process as JSON. It names no path,
 * so it never finds itself.
 */
const LIST_WINDOWS_PROCESSES =
  'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';

/**
 * Schema of one process in the JSON of `LIST_WINDOWS_PROCESSES`.
 */
const WINDOWS_PROCESS = z.object({ ProcessId: z.number(), CommandLine: z.string().nullish() });

/**
 * Schema of the JSON of `LIST_WINDOWS_PROCESSES`, which is one object for a single process.
 */
const WINDOWS_PROCESSES = z.union([z.array(WINDOWS_PROCESS), WINDOWS_PROCESS]);

/**
 * Pattern of a line of `ps` with the identifier and the command line of a process.
 */
const PS_LINE = /^\s*(\d+)\s+(.*)$/;

/**
 * Most bytes of the output of a command that lists the processes.
 */
const OUTPUT_LIMIT = 64 * 1024 * 1024;

/**
 * `StopProcessesFunction` that lists the processes with `Get-CimInstance` on Windows and with `ps` elsewhere. It stops
 * each one with its children with `taskkill` on Windows, and with `SIGTERM` elsewhere.
 */
export const systemStopProcesses: StopProcessesFunction = async (directories) => {
  let processes: FoundProcess[];
  try {
    processes = await listProcesses();
  } catch (error) {
    return { stopped: [], failures: [`The processes could not be listed, so none was stopped: ${reasonOf(error)}`] };
  }
  const found = processesInside(processes, directories, process.platform, process.pid);
  const failures = await Promise.all(found.map(stopProcess));
  return {
    stopped: found.filter((_, index) => failures[index] === undefined),
    failures: failures.filter((failure) => failure !== undefined),
  };
};

/**
 * Returns every process of the system with its command line.
 * If the processes cannot be listed, rejects with the error of the command that lists them.
 */
const listProcesses = async (): Promise<FoundProcess[]> => {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', LIST_WINDOWS_PROCESSES],
      { windowsHide: true, maxBuffer: OUTPUT_LIMIT },
    );
    const parsed = WINDOWS_PROCESSES.parse(JSON.parse(stdout));
    return (Array.isArray(parsed) ? parsed : [parsed]).map(({ ProcessId, CommandLine }) => ({
      pid: ProcessId,
      commandLine: CommandLine ?? '',
    }));
  }
  const { stdout } = await execFileAsync('ps', ['-A', '-ww', '-o', 'pid=', '-o', 'args='], { maxBuffer: OUTPUT_LIMIT });
  return stdout.split('\n').flatMap((line) => {
    const match = PS_LINE.exec(line);
    return match === null ? [] : [{ pid: Number(match[1]), commandLine: match[2] ?? '' }];
  });
};

/**
 * Stops the process `found`, with its children on Windows. If it still runs after the stop, returns the cause in one
 * sentence instead. A process that ended before the stop reached it counts as stopped.
 */
const stopProcess = async ({ pid, commandLine }: FoundProcess): Promise<string | undefined> => {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return undefined;
  } catch (error) {
    if (!isRunning(pid)) return undefined;
    return `The process ${pid} (${commandLine}) could not be stopped: ${reasonOf(error)}`;
  }
};

/**
 * Returns whether the process `pid` runs.
 */
const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // The process runs, but belongs to another user.
    return errorCode(error) === 'EPERM';
  }
};

/**
 * Returns the message of `error` on one line.
 */
const reasonOf = (error: unknown): string => errorMessage(error).replace(/\s+/g, ' ').trim();
