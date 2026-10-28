import type { ActivityStatus } from '../attachment/session-activity.ts';
import type { MessageSender } from '../storage/message-log-store.ts';
import type { Agent } from '../storage/session-store.ts';
import { claudeFindSubagentTranscript, claudeFindTranscript } from './find-transcript.claude.ts';

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
 * Status of the agent of a session that an entry of its transcript shows.
 */
export interface TranscriptActivity {
  /**
   * Status of the agent from the time of the entry on: `working` while a turn runs, and `idle` once a turn ended.
   */
  readonly status: Extract<ActivityStatus, 'idle' | 'working'>;

  /**
   * Time of the entry, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Newest action of the agent of a session that an entry of its transcript shows.
 */
export interface TranscriptAction {
  /**
   * Newest tool call of the agent in one line, such as `Bash: npm run typecheck`, or `null` once the agent wrote a
   * text message after its newest tool call.
   */
  readonly action: string | null;

  /**
   * Time of the entry, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Token usage of a model request of the agent of a session that an entry of its transcript shows.
 */
export interface TranscriptUsage {
  /**
   * Size of the context of the request in tokens: its input tokens, the ones written to the cache and the ones read
   * from it.
   */
  readonly contextTokens: number;

  /**
   * Identifier of the model that answered the request, such as `claude-opus-5-5`, or `null` when the entry names none.
   */
  readonly model: string | null;

  /**
   * Reasoning effort of the request, such as `xhigh`, or `null` when the entry names none.
   */
  readonly effort: string | null;

  /**
   * Time of the entry, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Skill that the agent of a session can run, as its transcript lists it.
 */
export interface TranscriptSkill {
  /**
   * Name of the skill, with the name of its plugin before a colon for the skill of a plugin, such as
   * `atomic-workflow:plan`.
   */
  readonly name: string;

  /**
   * What the skill does and when to use it, as the agent lists it.
   */
  readonly description: string;
}

/**
 * List of skills that a transcript holds: every skill that the session can run, or the skills that were added or
 * changed since the last list.
 */
export interface SkillListing {
  /**
   * Whether the list holds every skill of the session, so that it replaces the skills known so far. A list that is not
   * initial adds its skills to them, and replaces each one of the same name.
   */
  readonly initial: boolean;

  /**
   * Skills of the list, in the order that the agent lists them.
   */
  readonly skills: readonly TranscriptSkill[];
}

/**
 * Task that a transcript holds as the result of a call to the tool `taskCreate` or `taskGet` of the MCP server
 * `atomic-workflow`.
 */
export interface TranscriptTask {
  /**
   * Identifier of the task.
   */
  readonly taskId: number;

  /**
   * Slug of the task.
   */
  readonly slug: string;

  /**
   * Whether the call created the task, with `taskCreate`, rather than read it, with `taskGet`.
   */
  readonly created: boolean;
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
   * Identifier of the background task that runs the subagent of the transcript, by which the agent of its parent
   * stops it, such as with the tool `TaskStop` of Claude Code. `undefined` for the transcript of a session, which no
   * background task runs.
   */
  readonly backgroundTaskId: string | undefined;

  /**
   * Returns the message of a user or an agent that the line `line` of the transcript holds. If the line holds another
   * kind of entry, or is not valid, returns `undefined` instead.
   */
  parse(line: string): TranscriptMessage | undefined;

  /**
   * Returns the list of skills that the line `line` of the transcript holds. If the line holds another kind of entry,
   * or is not valid, returns `undefined` instead.
   */
  parseSkills(line: string): SkillListing | undefined;

  /**
   * Returns the status of the agent that the line `line` of the transcript shows. If the line shows no status, such as
   * an entry that the agent writes after its turn, or is not valid, returns `undefined` instead.
   */
  parseActivity(line: string): TranscriptActivity | undefined;

  /**
   * Returns the newest action of the agent that the line `line` of the transcript shows: its last tool call, or none
   * when its last block is a text message. If the line holds no tool call and no text message of the agent, or is not
   * valid, returns `undefined` instead.
   */
  parseAction(line: string): TranscriptAction | undefined;

  /**
   * Returns the token usage of the model request that the line `line` of the transcript holds the reply of. If the
   * line holds no reply of a model request, such as an error that the agent wrote in place of one, or is not valid,
   * returns `undefined` instead.
   */
  parseUsage(line: string): TranscriptUsage | undefined;

  /**
   * Returns the task that the line `line` of the transcript holds as the result of a call to the tool `taskCreate` or
   * `taskGet` of the MCP server `atomic-workflow`, which an earlier line of the transcript made. If the line holds no
   * such result, or the call failed, returns `undefined` instead. The lines must be passed in their order.
   */
  parseTask(line: string): TranscriptTask | undefined;

  /**
   * Returns the id of the ticket that the line `line` of the transcript holds as the result of a call to the tool
   * `worktreeCreate` of the MCP server `atomic-workflow`, which an earlier line of the transcript made. If the line
   * holds no such result, or the call failed, returns `undefined` instead. The lines must be passed in their order.
   */
  parseTicket(line: string): number | undefined;

  /**
   * Resolves when the session of the transcript ends, such as when Claude Code moves on to a new session after
   * `/clear`, or when a subagent is stopped. The transcript grows no more after that. Also resolves when `signal` aborts.
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

/**
 * Function that returns the transcript of the subagent with the session id `sessionId`, which runs inside the session
 * of the transcript `parent`, and whose prompt names `sessionId`. It waits a few seconds for the transcript to appear.
 * With `oneShot`, the subagent is one that the agent starts after the call and that carries out its prompt only: the
 * search waits a few minutes, and the session of the transcript also ends once the subagent finishes. If no such
 * transcript appears, or `signal` aborts first, returns `undefined` instead.
 */
export type FindSubagentTranscriptFunction = (
  parent: Transcript,
  sessionId: string,
  signal: AbortSignal,
  oneShot: boolean,
) => Promise<Transcript | undefined>;

/**
 * Default `FindSubagentTranscriptFunction`, which finds the transcript of a subagent of a Claude Code session.
 */
export const FindSubagentTranscript: FindSubagentTranscriptFunction = claudeFindSubagentTranscript;
