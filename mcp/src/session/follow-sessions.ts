import { BIND_SESSION_METHOD, type BindSessionParams } from '../attachment/bind-session.ts';
import { errorMessage } from '../rpc/error-message.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { SkillListing, Transcript, TranscriptSkill } from '../transcript/find-transcript.ts';
import type { Session } from './session.ts';

/**
 * Binds the session of the agent of `session` to `connection`, and logs its transcript over `connection`, until
 * `signal` aborts. When the agent moves on to a new session, such as after `/clear`, the binding and the log move on to
 * the new session. The log costs the session no tokens, since no tool and no result takes part in it, so a failure
 * goes to `log` of the dependencies of `session`, which only the logs of the agent show, and ends the follow. A session
 * of an agent without a known transcript is neither bound nor logged. Calls `onBound` once the first session is bound,
 * or once it turns out that none is. Never rejects.
 */
export const followSessions = async (
  session: Session,
  connection: RpcConnection,
  signal: AbortSignal,
  onBound: () => void,
): Promise<void> => {
  try {
    while (!signal.aborted && (await followCurrentSession(session, connection, signal, onBound)));
  } catch (error) {
    // A request that the close of the connection cuts short is no failure of the log.
    if (!signal.aborted) session.dependencies.log(`Could not follow the session: ${errorMessage(error)}`);
  } finally {
    onBound();
  }
};

/**
 * Returns the skills that the agent of `session` can run, as the transcript of the session `sessionId` lists them so
 * far. If `sessionId` is not the session that the agent runs now, throws.
 */
export const listSkills = (session: Session, sessionId: string): readonly TranscriptSkill[] => {
  if (session.transcript?.sessionId !== sessionId)
    throw new Error(`The session ${sessionId} is not the current session`);
  return [...session.skills.values()];
};

/**
 * Binds the session that the agent of `session` runs now to `connection`, calls `onBound`, and logs its transcript
 * over `connection`, until that session ends or `signal` aborts, and returns `true`. While it logs, it keeps the
 * skills that the transcript lists in `session`. If the agent has no known transcript, returns `false` instead.
 */
const followCurrentSession = async (
  session: Session,
  connection: RpcConnection,
  signal: AbortSignal,
  onBound: () => void,
): Promise<boolean> => {
  const { findTranscript, logTranscript, tailFile, clock } = session.dependencies;
  const { environment, parentProcessId, directory } = session.options;
  const transcript = await findTranscript(environment, parentProcessId);
  if (transcript === undefined) return false;
  session.transcript = transcript;
  session.skills = new Map();
  const params: BindSessionParams = { sessionId: transcript.sessionId };
  await connection.request(BIND_SESSION_METHOD, params, signal);
  onBound();
  await logTranscript(watchSkills(session, transcript), directory, connection, signal, { tailFile, clock });
  return true;
};

/**
 * Returns `transcript` with a `parseLine` that also keeps each list of skills of a line in `session`, while
 * `transcript` is the transcript of `session`. An initial list replaces the skills known so far, and a later list adds
 * its skills to them, in place of the ones of the same name.
 */
const watchSkills = (session: Session, transcript: Transcript): Transcript => ({
  ...transcript,
  parseLine: (line) => {
    const entry = transcript.parseLine(line);
    if (entry.skills !== undefined && session.transcript === transcript) keepSkills(session, entry.skills);
    return entry;
  },
});

/**
 * Keeps the skills of `listing` in `session`: an initial list in place of the skills known so far, and a later list
 * on top of them.
 */
const keepSkills = (session: Session, listing: SkillListing): void => {
  if (listing.initial) session.skills = new Map();
  for (const skill of listing.skills) session.skills.set(skill.name, skill);
};
