import { access, open, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { MessageSender } from '../storage/message-log-store.ts';
import type { FindSubagentTranscriptFunction, FindTranscriptFunction, TranscriptMessage } from './find-transcript.ts';

/**
 * Schema of the fields of an entry of a Claude Code transcript that a message needs. The format is internal to Claude
 * Code, so every field that a message does not need may be missing or change.
 */
const ENTRY = z.object({
  type: z.string(),
  uuid: z.string(),
  timestamp: z.iso.datetime(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]),
  }),
});

/**
 * Content of an entry of a Claude Code transcript: a text, or a list of blocks of which only the text blocks hold
 * text.
 */
type Content = z.output<typeof ENTRY>['message']['content'];

/**
 * Sender of a message, by the type of the entry of a Claude Code transcript that holds it.
 */
const SENDERS: ReadonlyMap<string, MessageSender> = new Map([
  ['user', 'user'],
  ['assistant', 'agent'],
]);

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
 * Number of bytes at the start of the transcript of a subagent that are searched for its session id. The first entry
 * holds the prompt, which names the session id in its first line.
 */
const PROMPT_BYTES = 16 * 1024;

/**
 * Returns the value of the JSON text `text`. If `text` is not valid JSON, returns `undefined` instead.
 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Returns the text of the file at `path`. If the file does not exist, returns `undefined` instead.
 */
const readFileIfExists = (path: string): Promise<string | undefined> => {
  return readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
};

/**
 * `FindTranscriptFunction` that finds the transcript of the session that a Claude Code process runs now. The process
 * writes the id of its session to `sessions/<process id>.json` in its configuration directory, which
 * `CLAUDE_CONFIG_DIR` names and which defaults to `~/.claude`. A new id replaces it after `/clear`. If the file holds
 * no session id, uses the one in `CLAUDE_CODE_SESSION_ID` instead, which is the session that the process ran when it
 * started the current process. Claude Code writes the transcript to `<session id>.jsonl` in a directory of `projects`
 * in its configuration directory.
 */
export const claudeFindTranscript: FindTranscriptFunction = async (environment, parentProcessId) => {
  const configuration = environment.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const sessionFile = join(configuration, 'sessions', `${parentProcessId}.json`);
  const sessionId = (await readSessionId(sessionFile)) ?? environment.CLAUDE_CODE_SESSION_ID;
  if (sessionId === undefined) return undefined;
  const projects = join(configuration, 'projects');
  const name = `${sessionId}.jsonl`;
  const path = (await findTranscriptFile(projects, name)) ?? expectedTranscriptFile(projects, name, environment);
  if (path === undefined) return undefined;
  return {
    agent: 'claude',
    sessionId,
    path,
    parse: entryParser(false),
    waitForEnd: (signal) => waitForEnd(sessionFile, sessionId, signal),
  };
};

/**
 * Returns the session id that the session file at `path` holds. If the file does not exist, or holds no session id,
 * returns `undefined` instead.
 */
const readSessionId = async (path: string): Promise<string | undefined> => {
  const text = await readFileIfExists(path);
  if (text === undefined) return undefined;
  const sessionFile = SESSION_FILE.safeParse(parseJson(text));
  return sessionFile.success ? sessionFile.data.sessionId : undefined;
};

/**
 * Reads the session file at `path` every `POLL_INTERVAL` ms, and resolves once it holds another session id than
 * `sessionId`, or when `signal` aborts.
 */
const waitForEnd = async (path: string, sessionId: string, signal: AbortSignal): Promise<void> => {
  while (!signal.aborted) {
    const current = await readSessionId(path);
    if (current !== undefined && current !== sessionId) return;
    // The only failure of the sleep is the abort, which ends the loop.
    await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined);
  }
};

/**
 * Returns the path of the file `name` in a directory of `projects`. If no directory holds it, returns `undefined`
 * instead.
 */
const findTranscriptFile = async (projects: string, name: string): Promise<string | undefined> => {
  const entries = await readdir(projects, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const candidates = entries.filter((entry) => entry.isDirectory()).map((entry) => join(projects, entry.name, name));
  const found = await Promise.all(
    candidates.map((candidate) =>
      access(candidate).then(
        () => true,
        () => false,
      ),
    ),
  );
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
 * `FindSubagentTranscriptFunction` that finds the transcript of a subagent of a Claude Code session. Claude Code writes
 * it to `subagents/agent-<agent id>.jsonl` in a directory beside the transcript of the parent, named after the session
 * of the parent, and starts it with the prompt of the subagent. Beside it, `agent-<agent id>.meta.json` sets
 * `stoppedByUser` once the subagent is stopped, such as by `TaskStop`. The directory is searched every `POLL_INTERVAL`
 * ms, until
 * `SUBAGENT_SEARCH_TIMEOUT` ms have passed.
 */
export const claudeFindSubagentTranscript: FindSubagentTranscriptFunction = async (parent, sessionId, signal) => {
  if (parent.agent !== 'claude') return undefined;
  const directory = join(parent.path.replace(/\.jsonl$/, ''), 'subagents');
  const deadline = Date.now() + SUBAGENT_SEARCH_TIMEOUT;
  for (;;) {
    const path = await findSubagentFile(directory, sessionId);
    if (path !== undefined)
      return {
        agent: 'claude',
        sessionId,
        path,
        parse: entryParser(true),
        waitForEnd: (signal) => waitForStop(path.replace(/\.jsonl$/, '.meta.json'), signal),
      };
    if (signal.aborted || Date.now() >= deadline) return undefined;
    // The only failure of the sleep is the abort, which the next round of the loop handles.
    await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined);
  }
};

/**
 * Returns the path of the transcript of a subagent in `directory` whose start names `sessionId`. If no transcript
 * there names it, returns `undefined` instead.
 */
const findSubagentFile = async (directory: string, sessionId: string): Promise<string | undefined> => {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const candidates = names
    .filter((name) => name.startsWith('agent-') && name.endsWith('.jsonl'))
    .map((name) => join(directory, name));
  const starts = await Promise.all(candidates.map(readStart));
  return candidates.find((_, index) => starts[index]?.includes(sessionId));
};

/**
 * Returns the text of the first `PROMPT_BYTES` bytes of the file at `path`.
 */
const readStart = async (path: string): Promise<string> => {
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(PROMPT_BYTES);
    const { bytesRead } = await file.read(buffer, 0, PROMPT_BYTES, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await file.close();
  }
};

/**
 * Reads the metadata file of a subagent at `path` every `POLL_INTERVAL` ms, and resolves once it sets `stoppedByUser`,
 * or when `signal` aborts.
 */
const waitForStop = async (path: string, signal: AbortSignal): Promise<void> => {
  while (!signal.aborted) {
    if (await isStopped(path)) return;
    // The only failure of the sleep is the abort, which ends the loop.
    await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined);
  }
};

/**
 * Returns whether the metadata file of a subagent at `path` sets `stoppedByUser`. A file that does not exist does not.
 */
const isStopped = async (path: string): Promise<boolean> => {
  const text = await readFileIfExists(path);
  if (text === undefined) return false;
  const meta = SUBAGENT_META.safeParse(parseJson(text));
  return meta.success && meta.data.stoppedByUser === true;
};

/**
 * Returns the function that returns the message of a user or an agent that a line of a Claude Code transcript holds.
 * With `sidechain`, only the entries of a subagent are messages, and without it, only the entries of the session
 * itself. Entries that only Claude Code wrote, such as the text of a skill or the notice that a background command
 * ended, are no messages, and neither are tool calls, tool results and thinking. If the line holds no message, the
 * function returns `undefined` instead.
 */
const entryParser = (sidechain: boolean): ((line: string) => TranscriptMessage | undefined) => {
  return (line) => parseEntry(line, sidechain);
};

/**
 * Returns the message of a user or an agent that the line `line` of a Claude Code transcript holds, as
 * `entryParser` describes it for `sidechain`.
 */
const parseEntry = (line: string, sidechain: boolean): TranscriptMessage | undefined => {
  const entry = ENTRY.safeParse(parseJson(line));
  if (!entry.success) return undefined;
  const { type, uuid, timestamp, isMeta, isSidechain = false, isCompactSummary, message } = entry.data;
  const sender = SENDERS.get(type);
  if (sender === undefined || isMeta || isSidechain !== sidechain || isCompactSummary) return undefined;
  const content = textOf(message.content);
  return content === '' ? undefined : { messageId: uuid, sender, content, timestamp: Date.parse(timestamp) };
};

/**
 * Returns the text of `content`, with its text blocks apart by an empty line.
 */
const textOf = (content: Content): string => {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n\n');
};
