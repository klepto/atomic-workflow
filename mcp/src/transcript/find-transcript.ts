import type { MessageSender } from '../storage/message-log-store.ts';
import type { Agent } from '../storage/session-store.ts';
import { claudeFindTranscript } from './find-transcript.claude.ts';

/**
 * Message of a user or an agent that a transcript holds.
 */
export interface TranscriptMessage {
  /**
   * Identifier that the agent gives the message, unique in its session.
   */
  readonly messageId: string;

  /**
   * Who wrote the message.
   */
  readonly sender: MessageSender;

  /**
   * Text of the message.
   */
  readonly content: string;

  /**
   * Time of the message, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Transcript of one session of an agent: a file that the agent appends one line of JSON to for each entry of the
 * session.
 */
export interface Transcript {
  /**
   * Agent that writes the transcript.
   */
  readonly agent: Agent;

  /**
   * Identifier of the session, as the agent gives it.
   */
  readonly sessionId: string;

  /**
   * Absolute path of the file of the transcript. The file may not exist yet.
   */
  readonly path: string;

  /**
   * Returns the message of a user or an agent that the line `line` of the transcript holds. If the line holds another
   * kind of entry, or is not valid, returns `undefined` instead.
   */
  parse(line: string): TranscriptMessage | undefined;

  /**
   * Resolves when the agent moves on from the session of the transcript to a new session, such as after `/clear` in
   * Claude Code. The transcript grows no more after that. Also resolves when `signal` aborts.
   * If the agent cannot be asked for its session, rejects.
   */
  waitForEnd(signal: AbortSignal): Promise<void>;
}

/**
 * Function that returns the transcript of the session that the agent runs now. The agent is the parent of the current
 * process, with the process id `parentProcessId`, and it is detected from the environment variables `environment`. If
 * no supported agent runs the process, returns `undefined` instead.
 */
export type FindTranscriptFunction = (
  environment: NodeJS.ProcessEnv,
  parentProcessId: number,
) => Promise<Transcript | undefined>;

/**
 * Default `FindTranscriptFunction`, which finds the transcript of a Claude Code session.
 */
export const FindTranscript: FindTranscriptFunction = claudeFindTranscript;
