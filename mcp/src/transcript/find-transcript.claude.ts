import { basename, join } from 'node:path';
import { z } from 'zod';
import { parseAction } from './claude-action.ts';
import { parseActivity } from './claude-activity.ts';
import { parseJson } from './claude-entry.ts';
import { parseMessage } from './claude-message.ts';
import { parseSkillListing } from './claude-skills.ts';
import { parseTask, parseTicketId } from './claude-tool-result.ts';
import { parseUsage } from './claude-usage.ts';
import type {
  CreateTranscriptFinderFunction,
  Transcript,
  TranscriptEntry,
  TranscriptFinderDependencies,
} from './find-transcript.ts';

/**
 * Schema of the fields of the session file of a Claude Code process that the session id needs. The format is internal
 * to Claude Code, so every other field may be missing or change.
 */
const SESSION_FILE = z.object({
  sessionId: z.string(),
});

/**
 * Schema of the fields of the metadata file of a Claude Code subagent that its end needs. The format is internal to
 * Claude Code, so every other field may be missing or change. `finished` is no end: Claude Code sets it each time the
 * subagent reports back, and a background command of the subagent wakes it again.
 */
const SUBAGENT_META = z.object({
  stoppedByUser: z.boolean().optional(),
  finished: z.boolean().optional(),
});

/**
 * Time in ms between two reads of the session file of a Claude Code process, of the metadata file of a subagent, or
 * of the directory of the transcripts of subagents.
 */
const POLL_INTERVAL = 500;

/**
 * Time in ms that the search for the transcript of a subagent goes on before it gives up.
 */
const SUBAGENT_SEARCH_TIMEOUT = 10_000;

/**
 * Time in ms that the search for the transcript of a one-shot subagent goes on before it gives up. The agent starts
 * the subagent only after the call that registers it, so it may take a while.
 */
const ONE_SHOT_SEARCH_TIMEOUT = 300_000;

/**
 * Text that the name of the transcript of a subagent starts with, before the agent id.
 */
const AGENT_FILE_PREFIX = 'agent-';

/**
 * Number of bytes at the start of the transcript of a subagent that are searched for its session id. The first entry
 * holds the prompt, which names the session id in its first line.
 */
const PROMPT_BYTES = 16 * 1024;

/**
 * State of the `TranscriptFinder` of one Claude Code process.
 */
interface Finder {
  /**
   * Parts that the finder reads its files and its time from.
   */
  readonly dependencies: TranscriptFinderDependencies;

  /**
   * Ids of the calls that run a wait for the messages of the atomic-workflow server, and of the background tasks that
   * they started, from every transcript that the finder found. A wait that one session started may end in the next
   * one, such as when `/clear` stops it, so the ids outlive the transcript that holds the call.
   */
  readonly awaitIds: Set<string>;
}

/**
 * `CreateTranscriptFinderFunction` that finds the transcripts of the sessions and the subagents of a Claude Code
 * process, with the files, the clock and the sleep of `dependencies`. Every transcript that it finds shares the ids of
 * the waits for the messages of the atomic-workflow server, so the notice that a wait ended is no message, whichever
 * transcript holds it.
 */
export const claudeCreateTranscriptFinder: CreateTranscriptFinderFunction = (dependencies) => {
  const finder: Finder = { dependencies, awaitIds: new Set() };
  return {
    findTranscript: (environment, parentProcessId) => findTranscript(environment, parentProcessId, finder),
    findSubagentTranscript: (parent, sessionId, signal, oneShot) =>
      findSubagentTranscript(parent, sessionId, signal, oneShot, finder),
  };
};

/**
 * Returns the transcript of the session that the Claude Code process `parentProcessId` runs now, with the files of
 * `finder`. The process writes the id of its session to `sessions/<process id>.json` in its configuration directory,
 * which `CLAUDE_CONFIG_DIR` of `environment` names and which defaults to `.claude` in the home directory. A new id
 * replaces it after `/clear`. If the file holds no session id, uses `CLAUDE_CODE_SESSION_ID` of `environment` instead,
 * which is the session that the process ran when it started the current process. Claude Code writes the transcript to
 * `<session id>.jsonl` in a directory of `projects` in its configuration directory. If neither names a session, or the
 * transcript is in no directory and `CLAUDE_PROJECT_DIR` is not set, returns `undefined` instead. Rejects when the
 * session file or the directory `projects` cannot be read for another cause than that it does not exist.
 */
const findTranscript = async (
  environment: NodeJS.ProcessEnv,
  parentProcessId: number,
  finder: Finder,
): Promise<Transcript | undefined> => {
  const configuration = environment.CLAUDE_CONFIG_DIR ?? join(finder.dependencies.homeDirectory, '.claude');
  const sessionFile = join(configuration, 'sessions', `${parentProcessId}.json`);
  const sessionId = (await readSessionId(sessionFile, finder)) ?? environment.CLAUDE_CODE_SESSION_ID;
  if (sessionId === undefined) return undefined;
  const projects = join(configuration, 'projects');
  const name = `${sessionId}.jsonl`;
  const path =
    (await findTranscriptFile(projects, name, finder)) ?? expectedTranscriptFile(projects, name, environment);
  if (path === undefined) return undefined;
  const waitForEnd = (signal: AbortSignal): Promise<void> =>
    pollUntil(async () => hasOtherSession(sessionFile, sessionId, finder), signal, finder);
  return claudeTranscript(sessionId, path, false, undefined, waitForEnd, finder);
};

/**
 * Returns the session id that the session file at `path` holds, read with the files of `finder`. If the file does not
 * exist, or holds no session id, returns `undefined` instead. Rejects when the file cannot be read for another cause.
 */
const readSessionId = async (path: string, finder: Finder): Promise<string | undefined> => {
  const text = await finder.dependencies.files.readText(path);
  if (text === undefined) return undefined;
  const sessionFile = SESSION_FILE.safeParse(parseJson(text));
  return sessionFile.success ? sessionFile.data.sessionId : undefined;
};

/**
 * Returns whether the session file at `path` names another session than `sessionId`, read with the files of `finder`.
 * A file that does not exist, or names no session, does not. Rejects when the file cannot be read for another cause.
 */
const hasOtherSession = async (path: string, sessionId: string, finder: Finder): Promise<boolean> => {
  const current = await readSessionId(path, finder);
  return current !== undefined && current !== sessionId;
};

/**
 * Returns the path of the file `name` in a directory of `projects`, with the files of `finder`. If no directory holds
 * it, returns `undefined` instead. Rejects when `projects` cannot be read for another cause than that it does not
 * exist.
 */
const findTranscriptFile = async (projects: string, name: string, finder: Finder): Promise<string | undefined> => {
  const { files } = finder.dependencies;
  const candidates = (await files.listDirectories(projects)).map((directory) => join(projects, directory, name));
  const found = await Promise.all(candidates.map((candidate) => files.exists(candidate)));
  return candidates.find((_, index) => found[index]);
};

/**
 * Returns the path where Claude Code writes the file `name` for the project in `CLAUDE_PROJECT_DIR` of `environment`,
 * which is right for a file that does not exist yet. The directory of a project is named after its path, with each
 * character that is not a letter or a digit replaced by `-`. If `CLAUDE_PROJECT_DIR` is not set, returns `undefined`
 * instead.
 */
const expectedTranscriptFile = (projects: string, name: string, environment: NodeJS.ProcessEnv): string | undefined => {
  const directory = environment.CLAUDE_PROJECT_DIR;
  return directory === undefined ? undefined : join(projects, directory.replace(/[^a-zA-Z0-9]/g, '-'), name);
};

/**
 * Returns the transcript of the subagent `sessionId` of the session of the transcript `parent`, with the files, the
 * clock and the sleep of `finder`. Claude Code writes it to `subagents/agent-<agent id>.jsonl` in a directory beside
 * the transcript of the parent, named after the session of the parent, and starts it with the prompt of the subagent.
 * The agent id is also the id of the background task that runs the subagent. Beside it, `agent-<agent id>.meta.json`
 * sets `stoppedByUser` once the subagent is stopped, such as by `TaskStop`, and `finished` each time that the subagent
 * ends its turn. A subagent that waits in the background for its messages finishes many times, so only a one-shot
 * subagent, with `oneShot`, ends when it finishes. The directory is searched every `POLL_INTERVAL` ms, until
 * `SUBAGENT_SEARCH_TIMEOUT` ms have passed, or `ONE_SHOT_SEARCH_TIMEOUT` ms for a one-shot subagent. If `parent` is no
 * transcript of Claude Code, no transcript appears in time, or `signal` aborts first, returns `undefined` instead.
 * Rejects when the directory cannot be read for another cause than that it does not exist, or when a transcript in it
 * cannot be read.
 */
const findSubagentTranscript = async (
  parent: Transcript,
  sessionId: string,
  signal: AbortSignal,
  oneShot: boolean,
  finder: Finder,
): Promise<Transcript | undefined> => {
  if (parent.agent !== 'claude') return undefined;
  const { clock, sleep } = finder.dependencies;
  const directory = join(parent.path.replace(/\.jsonl$/, ''), 'subagents');
  const deadline = clock.now() + (oneShot ? ONE_SHOT_SEARCH_TIMEOUT : SUBAGENT_SEARCH_TIMEOUT);
  for (;;) {
    const path = await findSubagentFile(directory, sessionId, finder);
    if (path !== undefined) {
      const backgroundTaskId = basename(path, '.jsonl').slice(AGENT_FILE_PREFIX.length);
      const meta = path.replace(/\.jsonl$/, '.meta.json');
      const waitForEnd = (signal: AbortSignal): Promise<void> =>
        pollUntil(async () => isStopped(meta, oneShot, finder), signal, finder);
      return claudeTranscript(sessionId, path, true, backgroundTaskId, waitForEnd, finder);
    }
    if (signal.aborted || clock.now() >= deadline) return undefined;
    await sleep(POLL_INTERVAL, signal);
  }
};

/**
 * Returns the path of the transcript of a subagent in `directory` whose start names `sessionId`, with the files of
 * `finder`. If no transcript there names it, returns `undefined` instead. Rejects when `directory` cannot be read for
 * another cause than that it does not exist, or when a transcript in it cannot be read.
 */
const findSubagentFile = async (directory: string, sessionId: string, finder: Finder): Promise<string | undefined> => {
  const { files } = finder.dependencies;
  const candidates = (await files.listNames(directory))
    .filter((name) => name.startsWith(AGENT_FILE_PREFIX) && name.endsWith('.jsonl'))
    .map((name) => join(directory, name));
  const starts = await Promise.all(candidates.map((candidate) => files.readStart(candidate, PROMPT_BYTES)));
  return candidates.find((_, index) => starts[index]?.includes(sessionId));
};

/**
 * Returns whether the metadata file of a subagent at `path`, read with the files of `finder`, sets `stoppedByUser`, or
 * `finished` for a one-shot subagent, with `oneShot`. A file that does not exist does not. Rejects when the file cannot
 * be read for another cause.
 */
const isStopped = async (path: string, oneShot: boolean, finder: Finder): Promise<boolean> => {
  const text = await finder.dependencies.files.readText(path);
  if (text === undefined) return false;
  const meta = SUBAGENT_META.safeParse(parseJson(text));
  return meta.success && (meta.data.stoppedByUser === true || (oneShot && meta.data.finished === true));
};

/**
 * Calls `check` every `POLL_INTERVAL` ms, with the sleep of `finder`, and resolves once it returns `true`, or when
 * `signal` aborts. Rejects when `check` rejects.
 */
const pollUntil = async (check: () => Promise<boolean>, signal: AbortSignal, finder: Finder): Promise<void> => {
  while (!signal.aborted) {
    if (await check()) return;
    await finder.dependencies.sleep(POLL_INTERVAL, signal);
  }
};

/**
 * Returns the transcript of Claude Code of the session `sessionId` at `path`, whose lines `finder` parses. With
 * `sidechain`, the transcript is the one of a subagent, which the background task `backgroundTaskId` runs. The session
 * of the transcript ends when `waitForEnd` resolves.
 */
const claudeTranscript = (
  sessionId: string,
  path: string,
  sidechain: boolean,
  backgroundTaskId: string | undefined,
  waitForEnd: (signal: AbortSignal) => Promise<void>,
  finder: Finder,
): Transcript => ({
  agent: 'claude',
  sessionId,
  path,
  backgroundTaskId,
  parseLine: lineParser(sidechain, finder),
  waitForEnd,
});

/**
 * Returns the function that returns the facets of a line of a Claude Code transcript, as `Transcript.parseLine` says.
 * With `sidechain`, only the entries of a subagent count, and without it, only the entries of the session itself. The
 * function keeps the calls to a tool that wait for their result, so it must see the lines of one transcript in their
 * order, and shares the ids of the waits for the messages of the atomic-workflow server with every transcript of
 * `finder`.
 */
const lineParser = (sidechain: boolean, finder: Finder): ((line: string) => TranscriptEntry) => {
  const taskCalls = new Map<string, string>();
  const ticketCalls = new Map<string, string>();
  return (line) => {
    const value = parseJson(line);
    return {
      task: parseTask(line, value, taskCalls),
      ticketId: parseTicketId(line, value, ticketCalls),
      message: parseMessage(line, value, sidechain, finder.awaitIds),
      skills: parseSkillListing(line, value, sidechain),
      activity: parseActivity(line, value, sidechain),
      action: parseAction(line, value, sidechain),
      usage: parseUsage(line, value, sidechain),
    };
  };
};
