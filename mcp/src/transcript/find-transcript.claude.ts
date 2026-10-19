import { access, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { MessageSender } from '../storage/message-log-store.ts';
import type { FindTranscriptFunction, TranscriptMessage } from './find-transcript.ts';

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
 * Time in ms between two reads of the session file of a Claude Code process.
 */
const POLL_INTERVAL = 500;

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
    parse: parseEntry,
    waitForEnd: (signal) => waitForEnd(sessionFile, sessionId, signal),
  };
};

/**
 * Returns the session id that the session file at `path` holds. If the file does not exist, or holds no session id,
 * returns `undefined` instead.
 */
const readSessionId = async (path: string): Promise<string | undefined> => {
  const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
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
 * Returns the message of a user or an agent that the line `line` of a Claude Code transcript holds. Entries that only
 * Claude Code wrote, such as the text of a skill, and entries of subagents are no messages, and neither are tool
 * calls, tool results and thinking. If the line holds no message, returns `undefined` instead.
 */
const parseEntry = (line: string): TranscriptMessage | undefined => {
  const entry = ENTRY.safeParse(parseJson(line));
  if (!entry.success) return undefined;
  const { type, uuid, timestamp, isMeta, isSidechain, isCompactSummary, message } = entry.data;
  const sender = SENDERS.get(type);
  if (sender === undefined || isMeta || isSidechain || isCompactSummary) return undefined;
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
