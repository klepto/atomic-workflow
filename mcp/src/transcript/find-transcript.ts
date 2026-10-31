import type { ActivityStatus } from '../attachment/session-activity.ts';
import type { Clock } from '../clock/clock.ts';
import type { MessageSender } from '../storage/message-log-store.ts';
import type { Agent } from '../storage/session-store.ts';
import type { SleepFunction } from './sleep.ts';
import type { TranscriptFiles } from './transcript-files.ts';

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
   * Whether the call created the task, with `taskCreate`, rather than read it, with `taskGet`.
   */
  readonly created: boolean;
}

/**
 * Facets of one line of a transcript. Each facet is `undefined` when the line does not hold it, so a line that is not
 * valid holds none.
 */
export interface TranscriptEntry {
  /**
   * Message of a user or an agent that the line holds. Tool calls, tool results, thinking and the entries that only
   * the agent wrote are no messages.
   */
  readonly message: TranscriptMessage | undefined;

  /**
   * List of skills that the line holds.
   */
  readonly skills: SkillListing | undefined;

  /**
   * Status of the agent that the line shows. An entry that the agent writes after its turn shows none.
   */
  readonly activity: TranscriptActivity | undefined;

  /**
   * Newest action of the agent that the line shows: its last tool call, or none when its last block is a text
   * message. A line with no tool call and no text message of the agent shows no action.
   */
  readonly action: TranscriptAction | undefined;

  /**
   * Token usage of the model request that the line holds the reply of. An error that the agent wrote in place of a
   * reply holds none.
   */
  readonly usage: TranscriptUsage | undefined;

  /**
   * Task that the line holds as the result of a call to the tool `taskCreate` or `taskGet` of the MCP server
   * `atomic-workflow`, which an earlier line of the transcript made. A failed call holds none.
   */
  readonly task: TranscriptTask | undefined;

  /**
   * Identifier of the ticket that the line holds as the result of a call to the tool `worktreeCreate` of the MCP server
   * `atomic-workflow`, which an earlier line of the transcript made. A failed call holds none.
   */
  readonly ticketId: number | undefined;
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
   * Returns the facets that the line `line` of the transcript holds. A result of a tool needs the line of its call, so
   * the lines must be passed in their order, each once.
   */
  parseLine(line: string): TranscriptEntry;

  /**
   * Resolves when the session of the transcript ends, such as when Claude Code moves on to a new session after
   * `/clear`, or when a subagent is stopped. The transcript grows no more after that. Also resolves when `signal`
   * aborts. Rejects when the file that tells the end of the session cannot be read for another cause than that it
   * does not exist.
   */
  waitForEnd(signal: AbortSignal): Promise<void>;
}

/**
 * Function that returns the transcript of the session that the agent runs now. The agent is the parent of the current
 * process, with the process id `parentProcessId`, and it is detected from the environment variables `environment`. If
 * no supported agent runs the process, or the agent runs no session that has a known transcript, returns `undefined`
 * instead. Rejects when a file or a directory that names the session or holds the transcripts cannot be read for
 * another cause than that it does not exist.
 */
export type FindTranscriptFunction = (
  environment: NodeJS.ProcessEnv,
  parentProcessId: number,
) => Promise<Transcript | undefined>;

/**
 * Function that returns the transcript of the subagent with the session id `sessionId`, which runs inside the session
 * of the transcript `parent`, and whose prompt names `sessionId`. The search looks for `sessionId` near the start of
 * each transcript of a subagent of `parent`, where its prompt is, and waits a few seconds for the transcript to
 * appear. With `oneShot`, the subagent is one that the agent starts after the call and that carries out its prompt
 * only: the search waits a few minutes, and the session of the transcript also ends once the subagent finishes. If no
 * such transcript appears, or `signal` aborts first, returns `undefined` instead. Rejects when the directory of the
 * transcripts of the subagents cannot be read for another cause than that it does not exist, or when one of the
 * transcripts in it cannot be read.
 */
export type FindSubagentTranscriptFunction = (
  parent: Transcript,
  sessionId: string,
  signal: AbortSignal,
  oneShot: boolean,
) => Promise<Transcript | undefined>;

/**
 * Functions that find the transcripts of the sessions and the subagents of one agent process. They share what one
 * transcript learns that another one needs, such as a wait for the messages of the atomic-workflow server that one
 * session starts and the next one ends.
 */
export interface TranscriptFinder {
  /**
   * Function that finds the transcript of the session that the agent runs now.
   */
  readonly findTranscript: FindTranscriptFunction;

  /**
   * Function that finds the transcript of a subagent of a session.
   */
  readonly findSubagentTranscript: FindSubagentTranscriptFunction;
}

/**
 * Parts that a `TranscriptFinder` is built from.
 */
export interface TranscriptFinderDependencies {
  /**
   * Files of the transcripts, and of the files that the agent keeps beside them.
   */
  readonly files: TranscriptFiles;

  /**
   * Source of the time, which ends a search for a transcript after its time limit.
   */
  readonly clock: Clock;

  /**
   * Function that waits between two reads of a file that the agent changes.
   */
  readonly sleep: SleepFunction;

  /**
   * Absolute path of the home directory of the user, which holds the configuration of the agent by default.
   */
  readonly homeDirectory: string;
}

/**
 * Function that returns the `TranscriptFinder` of one agent process, which reads the files of `dependencies`.
 */
export type CreateTranscriptFinderFunction = (dependencies: TranscriptFinderDependencies) => TranscriptFinder;
