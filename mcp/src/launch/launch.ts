/**
 * Function that starts the program `commandLine[0]` with the arguments that follow it, outside the process tree of
 * the caller, and resolves once the program has started. A kill of the process tree of the caller does not reach the
 * program.
 * If the program does not start, rejects.
 */
export type LaunchFunction = (commandLine: readonly string[]) => Promise<void>;
