import type { Clock } from '../clock/clock.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { Transcript } from './find-transcript.ts';
import type { TailFileFunction } from './tail-file.ts';

/**
 * Dependencies of a log of a transcript.
 */
export interface LogTranscriptDependencies {
  /**
   * Function that follows the file of the transcript.
   */
  readonly tailFile: TailFileFunction;

  /**
   * Source of the time at which the log starts.
   */
  readonly clock: Clock;
}

/**
 * Function that registers the session of `transcript`, with the directory of its project `directory`, over
 * `connection` to the repository server, and then reports each line of the transcript there, the lines that it holds
 * already and the ones that the agent appends later, with the parts of `dependencies`. It reports, in the order of the
 * lines:
 *
 * - each message of a user or an agent, which the repository server logs once, so a message is not logged twice;
 * - each task that a result of the tool `taskCreate` or `taskGet` holds, as the task of the session, and after a
 *   result of `taskCreate`, the alias of the session that names the task;
 * - each ticket that a result of the tool `worktreeCreate` holds, as the ticket of the session.
 *
 * After the lines of each read of the transcript, it reports each change of the status of the agent, working or idle,
 * at the first line of a turn, and then the newest action of the agent, both from the lines that the agent appends
 * after the start of the log. Last, it reports the context size, the model and the effort of the newest token usage,
 * from any line, those from before the start of the log included.
 *
 * It resolves when `signal` aborts, or when the session of the transcript ends and its last lines are reported.
 * Rejects when the transcript cannot be read, or the repository server fails a request.
 */
export type LogTranscriptFunction = (
  transcript: Transcript,
  directory: string,
  connection: RpcConnection,
  signal: AbortSignal,
  dependencies: LogTranscriptDependencies,
) => Promise<void>;
