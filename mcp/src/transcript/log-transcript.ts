import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { Transcript } from './find-transcript.ts';
import { rpcLogTranscript } from './log-transcript.rpc.ts';
import type { TailFileFunction } from './tail-file.ts';

/**
 * Dependencies of a log of a transcript.
 */
export interface LogTranscriptDependencies {
  /**
   * Function that follows the file of the transcript.
   */
  readonly tailFile: TailFileFunction;
}

/**
 * Function that registers the session of `transcript`, with the directory of its project `directory`, over
 * `connection` to the repository server, and then logs each message of the transcript there, the ones that it holds
 * already and the ones that the agent appends later. It also reports to the repository server whether the agent works or
 * is idle, from the first entry of each turn on, and the newest tool call of the agent, as the entries that the agent
 * appends after the start of the log show. It resolves when `signal` aborts, or
 * when the session of the transcript ends and its last messages are logged. A message that the repository server has
 * logged already is not logged twice.
 * If the transcript cannot be read, or the repository server fails a request, rejects.
 */
export type LogTranscriptFunction = (
  transcript: Transcript,
  directory: string,
  connection: RpcConnection,
  signal: AbortSignal,
  dependencies: LogTranscriptDependencies,
) => Promise<void>;

/**
 * Default `LogTranscriptFunction`, which calls the methods of the repository server one message at a time.
 */
export const LogTranscript: LogTranscriptFunction = rpcLogTranscript;
