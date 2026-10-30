import type { LogFunction } from './log.ts';

/**
 * `LogFunction` that writes each line to the standard error of the process, since the standard output of a session
 * server carries the MCP protocol.
 */
export const stderrLog: LogFunction = (line) => {
  process.stderr.write(`${line}\n`);
};
