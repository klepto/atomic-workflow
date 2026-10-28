import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { FoundProcess, StopProcessesFunction } from './stop-processes.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Whether the processes run on Windows, where paths compare without case and with either slash.
 */
const WINDOWS = process.platform === 'win32';

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
 * Pattern of the drive at the start of an absolute path of Windows, such as `c:`.
 */
const WINDOWS_DRIVE = /^([a-z]):/;

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
  const prefixes = directories.flatMap(prefixesOf);
  const found = processes.filter(
    ({ pid, commandLine }) =>
      pid !== process.pid && prefixes.some((prefix) => comparable(commandLine).includes(prefix)),
  );
  const failures = await Promise.all(found.map(stopProcess));
  return {
    stopped: found.filter((_, index) => failures[index] === undefined),
    failures: failures.filter((failure) => failure !== undefined),
  };
};

/**
 * Returns every process of the system with its command line.
 */
const listProcesses = async (): Promise<FoundProcess[]> => {
  if (WINDOWS) {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', LIST_WINDOWS_PROCESSES],
      {
        windowsHide: true,
        maxBuffer: OUTPUT_LIMIT,
      },
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
 * Returns the forms of the path of `directory` that a command line holds for a path inside it, in the form of
 * `comparable`, each with a trailing separator. On Windows, a shell of Git Bash writes `C:\work` as `/c/work`, so both
 * forms count.
 */
const prefixesOf = (directory: string): string[] => {
  const prefix = `${comparable(resolve(directory))}${WINDOWS ? '\\' : '/'}`;
  if (!WINDOWS) return [prefix];
  return [prefix, prefix.replace(WINDOWS_DRIVE, '\\$1')];
};

/**
 * Returns `text` in a form where two spellings of one path compare equal: on Windows in lower case, with backslashes.
 */
const comparable = (text: string): string => (WINDOWS ? text.toLowerCase().replaceAll('/', '\\') : text);

/**
 * Stops the process `found`, with its children on Windows. If it still runs after the stop, returns the cause in one
 * sentence instead. A process that ended before the stop reached it counts as stopped.
 */
const stopProcess = async ({ pid, commandLine }: FoundProcess): Promise<string | undefined> => {
  try {
    if (WINDOWS) await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(pid, 'SIGTERM');
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
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
};

/**
 * Returns the message of `error` on one line.
 */
const reasonOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim();
