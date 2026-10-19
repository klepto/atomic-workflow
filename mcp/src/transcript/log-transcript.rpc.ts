import type { z } from 'zod';
import { logMessageMethod } from '../rpc/method.log-message.ts';
import { registerSessionMethod } from '../rpc/method.register-session.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { Transcript } from './find-transcript.ts';
import type { LogTranscriptFunction } from './log-transcript.ts';

/**
 * `LogTranscriptFunction` that calls `registerSession` once and then `logMessage` for each message, one after the
 * other, so the log keeps the order of the transcript. The end of the session stops the tail of the transcript, which
 * reads the file once more before it resolves.
 */
export const rpcLogTranscript: LogTranscriptFunction = async (
  transcript,
  directory,
  connection,
  signal,
  dependencies,
) => {
  const session: z.input<typeof registerSessionMethod.params> = {
    sessionId: transcript.sessionId,
    agent: transcript.agent,
    directory,
  };
  await connection.request(registerSessionMethod.name, session, signal);
  const ended = new AbortController();
  const following = AbortSignal.any([signal, ended.signal]);
  const stop = (): void => ended.abort();
  // Requests take `signal`, not `following`, so the last read after the end of the session still logs its messages.
  await Promise.all([
    transcript.waitForEnd(following).finally(stop),
    dependencies
      .tailFile(transcript.path, (lines) => logLines(transcript, connection, lines, signal), following)
      .finally(stop),
  ]);
};

/**
 * Logs each message that the lines `lines` of `transcript` hold over `connection`, in order.
 */
const logLines = async (
  transcript: Transcript,
  connection: RpcConnection,
  lines: readonly string[],
  signal: AbortSignal,
): Promise<void> => {
  for (const line of lines) {
    const message = transcript.parse(line);
    if (message === undefined) continue;
    const params: z.input<typeof logMessageMethod.params> = { sessionId: transcript.sessionId, ...message };
    await connection.request(logMessageMethod.name, params, signal);
  }
};
