import type { AwaitCommandLineFunction } from './await-command-line.ts';

/**
 * Number of characters at the beginning of a session id that name the session in a command line. The command line is
 * part of each output of the tool and of each call that runs it, so a short name saves tokens.
 */
const SESSION_PREFIX_LENGTH = 8;

/**
 * `AwaitCommandLineFunction` whose command line runs the same in Bash and in PowerShell. It calls `node` by name,
 * quotes the entry point with forward slashes, which neither shell reads as an escape, and names the session by the
 * first `SESSION_PREFIX_LENGTH` characters of its id.
 */
export const shellAwaitCommandLine: AwaitCommandLineFunction = (entryPoint, sessionId, after) => {
  const command = `node "${entryPoint.replaceAll('\\', '/')}" ${sessionId.slice(0, SESSION_PREFIX_LENGTH)}`;
  return after === undefined ? command : `${command} --after ${after}`;
};
