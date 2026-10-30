import type { z } from 'zod';
import type { Attachment } from '../attachment/attach.ts';
import { errorMessage } from '../rpc/error-message.ts';
import { subagentEndMethod } from '../rpc/method.subagent-end.ts';
import type { Transcript } from '../transcript/find-transcript.ts';
import type { Session } from './session.ts';

/**
 * Logs the transcript of the subagent `sessionId`, which runs inside the session `parentId` of `session`, in the
 * background, until the subagent is stopped or the connection to the repository server closes. A one-shot subagent,
 * which the agent starts after the call when `oneShot` is `true`, is also logged until it finishes its prompt. Once the
 * subagent is stopped or finished, the repository server learns that it has ended, and so it does when no transcript of
 * a one-shot subagent appears. A failure of the log goes to `log` of the dependencies of `session`, like a failure of
 * the log of the session.
 * If `session` is not attached, or `parentId` is not the session that the agent runs now, throws.
 */
export const followSubagent = (session: Session, sessionId: string, parentId: string, oneShot: boolean): void => {
  const parent = session.transcript;
  if (session.attachment === undefined || parent?.sessionId !== parentId)
    throw new Error(`The session ${parentId} is not the current session`);
  void logSubagent(session, session.attachment, parent, sessionId, oneShot);
};

/**
 * Finds the transcript of the subagent `sessionId` of the session of the transcript `parent`, and logs it over the
 * connection of `attachment` until the subagent is stopped, or finished for a one-shot subagent, or the connection
 * closes. While it logs, `session` keeps the id of the background task that runs the subagent. Then tells the
 * repository server that the subagent has ended, unless the connection closed. A one-shot subagent without a
 * transcript has ended too. A failure goes to `log` of the dependencies of `session`. Never rejects.
 */
const logSubagent = async (
  session: Session,
  attachment: Promise<Attachment>,
  parent: Transcript,
  sessionId: string,
  oneShot: boolean,
): Promise<void> => {
  const { findSubagentTranscript, logTranscript, tailFile, clock, log } = session.dependencies;
  const logging = new AbortController();
  try {
    const { connection } = await attachment;
    void connection.closed.then(() => logging.abort());
    const end = async (): Promise<unknown> => {
      const params: z.input<typeof subagentEndMethod.params> = { sessionId };
      return connection.request(subagentEndMethod.name, params, logging.signal);
    };
    const transcript = await findSubagentTranscript(parent, sessionId, logging.signal, oneShot);
    if (transcript === undefined) {
      if (oneShot && !logging.signal.aborted) await end();
      throw new Error('Found no transcript');
    }
    if (transcript.backgroundTaskId !== undefined) session.subagentTasks.set(sessionId, transcript.backgroundTaskId);
    await logTranscript(transcript, session.options.directory, connection, logging.signal, { tailFile, clock });
    if (logging.signal.aborted) return;
    await end();
  } catch (error) {
    // A request that the close of the connection cuts short is no failure of the log.
    if (!logging.signal.aborted) log(`Could not log the subagent ${sessionId}: ${errorMessage(error)}`);
  } finally {
    session.subagentTasks.delete(sessionId);
  }
};
