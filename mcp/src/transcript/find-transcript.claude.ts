import { access, open, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { MessageSender } from '../storage/message-log-store.ts';
import type {
  FindSubagentTranscriptFunction,
  FindTranscriptFunction,
  SkillListing,
  TranscriptActivity,
  TranscriptMessage,
  TranscriptSkill,
  TranscriptTask,
} from './find-transcript.ts';

/**
 * Schema of the fields of an entry of a Claude Code transcript that a message or a status needs. `stop_reason` is
 * `end_turn` on each entry of the agent that ends its turn. The format is internal to Claude Code, so every field that
 * a message does not need may be missing or change.
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
    stop_reason: z.string().nullish().catch(undefined),
  }),
});

/**
 * Stop reason of an entry of the agent that ends its turn.
 */
const END_TURN = 'end_turn';

/**
 * Content of an entry of a Claude Code transcript: a text, or a list of blocks of which only the text blocks hold
 * text.
 */
type Content = z.output<typeof ENTRY>['message']['content'];

/**
 * Schema of the fields of an entry of a Claude Code transcript that a list of skills needs. Claude Code lists the
 * skills that the model can run as an attachment of the type `skill_listing`: all of them at the start of a session,
 * and later the ones that were added or changed. `content` holds one line `- <name>: <description>` per skill, in the
 * order of `names`. The format is internal to Claude Code, so every other field may be missing or change.
 */
const SKILL_LISTING = z.object({
  type: z.literal('attachment'),
  isSidechain: z.boolean().optional(),
  attachment: z.object({
    type: z.literal('skill_listing'),
    content: z.string(),
    isInitial: z.boolean().optional(),
    names: z.array(z.string()),
  }),
});

/**
 * Schema of the fields of an entry of a Claude Code transcript that a background command needs: the calls of the
 * agent to a tool, each with the command that it runs, and the results of the tools, each with the call that it
 * answers and the id of the background task that it started. The format is internal to Claude Code, so every other
 * field may be missing or change.
 */
const TOOL_ENTRY = z.object({
  type: z.string(),
  message: z.object({
    content: z.array(
      z.object({
        type: z.string(),
        id: z.string().optional(),
        tool_use_id: z.string().optional(),
        input: z.object({ command: z.unknown() }).partial().optional(),
      }),
    ),
  }),
  toolUseResult: z.object({ backgroundTaskId: z.unknown() }).partial().optional().catch(undefined),
});

/**
 * Text that the command line of each wait for the messages of the atomic-workflow server holds: the name of the entry
 * point that waits, `await-command.mjs` in the bundle and `await-command.main.ts` in the sources.
 */
const AWAIT_COMMAND_MARK = 'await-command.';

/**
 * Ids of the calls that run a wait for the messages of the atomic-workflow server, and of the background tasks that
 * they started, from every transcript that this process parsed. A wait that one session started may end in the next
 * one, such as when `/clear` stops it, so the ids outlive the transcript that holds the call.
 */
const awaitIds = new Set<string>();

/**
 * Pattern of the name of a tool of the MCP server `atomic-workflow` whose result is a task, `taskCreate` or
 * `taskGet`, after the prefix that Claude Code gives the tools of the server, such as
 * `mcp__plugin_atomic-workflow_atomic-workflow__`. Its first group is the name of the tool.
 */
const TASK_TOOL = /atomic-workflow__(taskCreate|taskGet)$/;

/**
 * Name of the tool of `TASK_TOOL` that creates the task of its result.
 */
const TASK_CREATE_TOOL = 'taskCreate';

/**
 * Text that every line of a Claude Code transcript with a call to a tool of `TASK_TOOL` holds, which a line is searched
 * for before it is parsed, since most lines hold none.
 */
const TASK_TOOL_MARK = 'atomic-workflow__task';

/**
 * Pattern of the name of the tool of the MCP server `atomic-workflow` whose result names a ticket, `worktreeCreate`,
 * after the prefix that Claude Code gives the tools of the server.
 */
const TICKET_TOOL = /atomic-workflow__worktreeCreate$/;

/**
 * Text that every line of a Claude Code transcript with a call to the tool of `TICKET_TOOL` holds.
 */
const TICKET_TOOL_MARK = 'atomic-workflow__worktreeCreate';

/**
 * Schema of the fields of an entry of a Claude Code transcript that a call to a tool or its result needs: the name and
 * the id of each call, and for each result the call that it answers, whether it failed, and its content. The format
 * is internal to Claude Code, so every other field may be missing or change.
 */
const TASK_TOOL_ENTRY = z.object({
  message: z.object({
    content: z.array(
      z.object({
        type: z.string(),
        id: z.string().optional(),
        name: z.string().optional(),
        tool_use_id: z.string().optional(),
        is_error: z.boolean().optional(),
        content: z.unknown().optional(),
      }),
    ),
  }),
});

/**
 * Schema of the content of the result of a tool of `TASK_TOOL` or `TICKET_TOOL`: one text that holds the result as
 * JSON.
 */
const TASK_RESULT = z.tuple([z.object({ type: z.literal('text'), text: z.string() })]);

/**
 * Schema of the task that the result of a tool of `TASK_TOOL` holds, with only its id and its slug.
 */
const TASK_ID = z.object({ id: z.number().int().positive(), slug: z.string().min(1) });

/**
 * Schema of the result of the tool of `TICKET_TOOL`, with only the id of its ticket.
 */
const TICKET_OF_RESULT = z.object({ ticket: z.object({ id: z.number().int().positive() }) });

/**
 * Text that every line of a Claude Code transcript with a list of skills holds, which a line is searched for before
 * it is parsed, since most lines hold none.
 */
const SKILL_LISTING_MARK = '"skill_listing"';

/**
 * Sender of a message, by the type of the entry of a Claude Code transcript that holds it.
 */
const SENDERS: ReadonlyMap<string, MessageSender> = new Map([
  ['user', 'user'],
  ['assistant', 'agent'],
]);

/**
 * Texts of a message of a subagent that end its turn, as its instructions word them: it waits for the next message of
 * the server, or the server has stopped its messages. Each word is a quote after the line `atomic-workflow:`, which
 * marks it as text of the atomic-workflow server, and the bare word counts as well.
 */
const SUBAGENT_TURN_ENDS: ReadonlySet<string> = new Set(
  ['waiting', 'stopped'].flatMap((word) => [word, `atomic-workflow:\n> ${word}`, `atomic-workflow:\r\n> ${word}`]),
);

/**
 * Name of the tool that Claude Code gives a subagent to report back to its parent. A subagent may end its turn with a
 * report through it in place of a message.
 */
const HANDBACK_TOOL = 'SubagentHandback';

/**
 * Schema of the fields of an entry of a Claude Code transcript that a report through `HANDBACK_TOOL` needs: the name of
 * each call of a tool, and the message that it reports. The format is internal to Claude Code, so every other field
 * may be missing or change.
 */
const HANDBACK_ENTRY = z.object({
  message: z.object({
    content: z.array(
      z.object({
        type: z.string(),
        name: z.string().optional(),
        input: z.object({ message: z.unknown() }).partial().optional().catch(undefined),
      }),
    ),
  }),
});

/**
 * Text that Claude Code starts a message of the user with when the user interrupts a turn, which ends the turn without
 * a `Stop` hook.
 */
const INTERRUPT_MARK = '[Request interrupted by user';

/**
 * Texts that Claude Code starts a message of the user with for a local command, such as `/clear`, and for its output.
 * A local command runs no turn, so no `Stop` hook ends it.
 */
const LOCAL_COMMAND_MARKS: readonly string[] = ['<command-', '<local-command-'];

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
    backgroundTaskId: undefined,
    parse: entryParser(false),
    parseSkills: (line) => parseSkillListing(line, false),
    parseActivity: (line) => parseActivity(line, false),
    parseTask: taskParser(),
    parseTicket: ticketParser(),
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
 * of the parent, and starts it with the prompt of the subagent. The agent id is also the id of the background task that
 * runs the subagent. Beside it, `agent-<agent id>.meta.json` sets `stoppedByUser` once the subagent is stopped, such
 * as by `TaskStop`, and `finished` each time that the subagent ends its turn. A subagent that waits in the background
 * for its messages finishes many times, so only a one-shot subagent ends when it finishes. The directory is searched
 * every `POLL_INTERVAL` ms, until `SUBAGENT_SEARCH_TIMEOUT` ms have passed, or `ONE_SHOT_SEARCH_TIMEOUT` ms for a
 * one-shot subagent.
 */
export const claudeFindSubagentTranscript: FindSubagentTranscriptFunction = async (
  parent,
  sessionId,
  signal,
  oneShot,
) => {
  if (parent.agent !== 'claude') return undefined;
  const directory = join(parent.path.replace(/\.jsonl$/, ''), 'subagents');
  const deadline = Date.now() + (oneShot ? ONE_SHOT_SEARCH_TIMEOUT : SUBAGENT_SEARCH_TIMEOUT);
  for (;;) {
    const path = await findSubagentFile(directory, sessionId);
    if (path !== undefined)
      return {
        agent: 'claude',
        sessionId,
        path,
        backgroundTaskId: basename(path, '.jsonl').slice(AGENT_FILE_PREFIX.length),
        parse: entryParser(true),
        parseSkills: (line) => parseSkillListing(line, true),
        parseActivity: (line) => parseActivity(line, true),
        parseTask: taskParser(),
        parseTicket: ticketParser(),
        waitForEnd: (signal) => waitForStop(path.replace(/\.jsonl$/, '.meta.json'), oneShot, signal),
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
    .filter((name) => name.startsWith(AGENT_FILE_PREFIX) && name.endsWith('.jsonl'))
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
 * or `finished` for a one-shot subagent, or when `signal` aborts.
 */
const waitForStop = async (path: string, oneShot: boolean, signal: AbortSignal): Promise<void> => {
  while (!signal.aborted) {
    if (await isStopped(path, oneShot)) return;
    // The only failure of the sleep is the abort, which ends the loop.
    await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined);
  }
};

/**
 * Returns whether the metadata file of a subagent at `path` sets `stoppedByUser`, or `finished` for a one-shot
 * subagent. A file that does not exist does not.
 */
const isStopped = async (path: string, oneShot: boolean): Promise<boolean> => {
  const text = await readFileIfExists(path);
  if (text === undefined) return false;
  const meta = SUBAGENT_META.safeParse(parseJson(text));
  return meta.success && (meta.data.stoppedByUser === true || (oneShot && meta.data.finished === true));
};

/**
 * Returns the function that returns the task that a line of a Claude Code transcript holds as the result of a call to
 * a tool of `TASK_TOOL`. The function keeps the calls that it has seen and not yet matched to their result, so it must
 * see the lines in their order.
 */
const taskParser = (): ((line: string) => TranscriptTask | undefined) => {
  const calls = new Map<string, string>();
  return (line) =>
    parseResult(line, calls, TASK_TOOL, TASK_TOOL_MARK, (content, tool) => taskOf(content, tool === TASK_CREATE_TOOL));
};

/**
 * Returns the function that returns the id of the ticket that a line of a Claude Code transcript holds as the result
 * of a call to the tool of `TICKET_TOOL`. Like the function of `taskParser`, it must see the lines in their order.
 */
const ticketParser = (): ((line: string) => number | undefined) => {
  const calls = new Map<string, string>();
  return (line) => parseResult(line, calls, TICKET_TOOL, TICKET_TOOL_MARK, ticketIdOf);
};

/**
 * Returns what `valueOf` finds in the line `line` as the result of one of the calls `calls`, and removes that call from
 * `calls`. Adds to `calls` the id of each call to a tool of `tool` that the line holds, with the name of the tool: the
 * first group of `tool`, or else the whole match. `valueOf` takes the content of the result and the name of the tool
 * of its call. Only a line that holds `mark`, or a result while a call waits for one, is parsed. If the line holds no
 * result of such a call, or the call failed, returns `undefined` instead.
 */
const parseResult = <T>(
  line: string,
  calls: Map<string, string>,
  tool: RegExp,
  mark: string,
  valueOf: (content: unknown, tool: string) => T | undefined,
): T | undefined => {
  if (!line.includes(mark) && (calls.size === 0 || !line.includes('"tool_result"'))) return undefined;
  const entry = TASK_TOOL_ENTRY.safeParse(parseJson(line));
  if (!entry.success) return undefined;
  let value: T | undefined;
  for (const part of entry.data.message.content) {
    const match = tool.exec(part.name ?? '');
    if (part.type === 'tool_use' && part.id !== undefined && match !== null) calls.set(part.id, match[1] ?? match[0]);
    if (part.type !== 'tool_result' || part.tool_use_id === undefined) continue;
    const name = calls.get(part.tool_use_id);
    if (name === undefined) continue;
    calls.delete(part.tool_use_id);
    value ??= part.is_error === true ? undefined : valueOf(part.content, name);
  }
  return value;
};

/**
 * Returns the task that the content `content` of the result of a tool of `TASK_TOOL` holds, which the call created
 * when `created` is true. If it holds no task, such as the message of a failure, returns `undefined` instead.
 */
const taskOf = (content: unknown, created: boolean): TranscriptTask | undefined => {
  const result = TASK_RESULT.safeParse(content);
  if (!result.success) return undefined;
  const task = TASK_ID.safeParse(parseJson(result.data[0].text));
  return task.success ? { taskId: task.data.id, slug: task.data.slug, created } : undefined;
};

/**
 * Returns the id of the ticket that the content `content` of the result of the tool of `TICKET_TOOL` holds. If it
 * holds no ticket, such as the message of a failure, returns `undefined` instead.
 */
const ticketIdOf = (content: unknown): number | undefined => {
  const result = TASK_RESULT.safeParse(content);
  if (!result.success) return undefined;
  const worktrees = TICKET_OF_RESULT.safeParse(parseJson(result.data[0].text));
  return worktrees.success ? worktrees.data.ticket.id : undefined;
};

/**
 * Returns the function that returns the message of a user or an agent that a line of a Claude Code transcript holds.
 * With `sidechain`, only the entries of a subagent are messages, and without it, only the entries of the session
 * itself. Entries that only Claude Code wrote, such as the text of a skill, are no messages, and neither are tool
 * calls, tool results and thinking. Neither is the notice that a wait for the messages of the atomic-workflow server
 * ended: the function keeps in `awaitIds` the id of each call that runs the wait and of the background task that the
 * call started, and a message of the user that names one of them is no message. If the line holds no message, the
 * function returns `undefined` instead.
 */
const entryParser = (sidechain: boolean): ((line: string) => TranscriptMessage | undefined) => {
  return (line) => {
    const value = parseJson(line);
    keepAwaitIds(line, value);
    const message = parseEntry(value, sidechain);
    if (message?.sender === 'user' && namesAny(message.content, awaitIds)) return undefined;
    return message;
  };
};

/**
 * Adds to `awaitIds` the ids that the entry `value` of the line `line` of a Claude Code transcript holds of a
 * wait for the messages of the atomic-workflow server: the id of each call of a tool whose command holds
 * `AWAIT_COMMAND_MARK`, and the id of the background task that a result of one of those calls started.
 */
const keepAwaitIds = (line: string, value: unknown): void => {
  if (!line.includes(AWAIT_COMMAND_MARK) && (awaitIds.size === 0 || !line.includes('"tool_result"'))) return;
  const entry = TOOL_ENTRY.safeParse(value);
  if (!entry.success) return;
  const taskId = entry.data.toolUseResult?.backgroundTaskId;
  for (const { type, id, tool_use_id: callId, input } of entry.data.message.content) {
    const command = input?.command;
    if (type === 'tool_use' && id !== undefined && typeof command === 'string' && command.includes(AWAIT_COMMAND_MARK))
      awaitIds.add(id);
    if (type === 'tool_result' && callId !== undefined && awaitIds.has(callId) && typeof taskId === 'string')
      awaitIds.add(taskId);
  }
};

/**
 * Returns whether the text `text` holds one of the ids of `ids`.
 */
const namesAny = (text: string, ids: ReadonlySet<string>): boolean => [...ids].some((id) => text.includes(id));

/**
 * Returns the message of a user or an agent that the value `value` of a line of a Claude Code transcript holds, as
 * `entryParser` describes it for `sidechain`, without the waits for the messages of the atomic-workflow server.
 */
const parseEntry = (value: unknown, sidechain: boolean): TranscriptMessage | undefined => {
  const entry = ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { type, uuid, timestamp, isMeta, isSidechain = false, isCompactSummary, message } = entry.data;
  const sender = SENDERS.get(type);
  if (sender === undefined || isMeta || isSidechain !== sidechain || isCompactSummary) return undefined;
  const content = textOf(message.content);
  return content === '' ? undefined : { messageId: uuid, sender, content, timestamp: Date.parse(timestamp) };
};

/**
 * Returns the status of the agent that the line `line` of a Claude Code transcript shows. With `sidechain`, only the
 * entries of a subagent count, and without it, only the entries of the session itself. Each entry of the user or the
 * agent shows that a turn runs, tool calls and tool results included. A message of the user that marks an interrupt
 * shows that the turn ended, and so does an entry of a subagent that ends its turn, as `endsSubagentTurn` tells.
 * Entries that only Claude Code wrote, a local command and its output, and every other entry, such as the time that
 * Claude Code notes after a turn, show no status, and neither does a line that is not valid, so the function returns
 * `undefined` for it.
 */
const parseActivity = (line: string, sidechain: boolean): TranscriptActivity | undefined => {
  const value = parseJson(line);
  const entry = ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { type, timestamp, isMeta, isSidechain = false, isCompactSummary, message } = entry.data;
  if (!SENDERS.has(type) || isMeta || isSidechain !== sidechain || isCompactSummary) return undefined;
  const text = textOf(message.content).trim();
  if (type === 'user' && LOCAL_COMMAND_MARKS.some((mark) => text.startsWith(mark))) return undefined;
  const ended =
    type === 'user'
      ? text.startsWith(INTERRUPT_MARK)
      : sidechain && endsSubagentTurn(line, value, text, message.stop_reason);
  return { status: ended ? 'idle' : 'working', timestamp: Date.parse(timestamp) };
};

/**
 * Returns whether the entry `value` of an agent, from the line `line` of the transcript of a subagent, with the text
 * `text` and the stop reason `stopReason`, ends the turn of the subagent: an entry that Claude Code marks with
 * `END_TURN`, a message whose text is one of `SUBAGENT_TURN_ENDS`, or a report through `HANDBACK_TOOL` whose message
 * is one of them. The stop reason holds even when the subagent ends its turn with another text than its instructions
 * name.
 */
const endsSubagentTurn = (
  line: string,
  value: unknown,
  text: string,
  stopReason: string | null | undefined,
): boolean => {
  if (stopReason === END_TURN || SUBAGENT_TURN_ENDS.has(text)) return true;
  if (!line.includes(HANDBACK_TOOL)) return false;
  const entry = HANDBACK_ENTRY.safeParse(value);
  if (!entry.success) return false;
  return entry.data.message.content.some(
    ({ type, name, input }) =>
      type === 'tool_use' &&
      name === HANDBACK_TOOL &&
      typeof input?.message === 'string' &&
      SUBAGENT_TURN_ENDS.has(input.message.trim()),
  );
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

/**
 * Returns the list of skills that the line `line` of a Claude Code transcript holds. With `sidechain`, only the entries
 * of a subagent count, and without it, only the entries of the session itself. If the line holds no list of skills,
 * returns `undefined` instead.
 */
const parseSkillListing = (line: string, sidechain: boolean): SkillListing | undefined => {
  if (!line.includes(SKILL_LISTING_MARK)) return undefined;
  const entry = SKILL_LISTING.safeParse(parseJson(line));
  if (!entry.success || (entry.data.isSidechain ?? false) !== sidechain) return undefined;
  const { content, isInitial = false, names } = entry.data.attachment;
  const descriptions = descriptionsOf(content, names);
  return {
    initial: isInitial,
    skills: names.map((name) => ({ name, description: descriptions.get(name) ?? '' })),
  };
};

/**
 * Returns the description of each skill of `names` that the text `content` of a list of skills holds, by name. A skill
 * starts a line `- <name>: <description>`, and a line that starts no skill continues the description before it.
 */
const descriptionsOf = (content: string, names: readonly string[]): ReadonlyMap<string, string> => {
  const descriptions = new Map<string, string>();
  let current: TranscriptSkill | undefined;
  for (const line of content.split('\n')) {
    const name = startedSkill(line, names);
    if (name !== undefined) current = { name, description: line.slice(name.length + 3).trim() };
    else if (current !== undefined) current = { ...current, description: `${current.description}\n${line}` };
    if (current !== undefined) descriptions.set(current.name, current.description);
  }
  return descriptions;
};

/**
 * Returns the name of `names` whose skill the line `line` of a list of skills starts, as `- <name>:`. A name may hold a
 * colon itself, so the longest name that fits wins. If the line starts no skill, returns `undefined` instead.
 */
const startedSkill = (line: string, names: readonly string[]): string | undefined =>
  names
    .filter((name) => line.startsWith(`- ${name}:`))
    .reduce<string | undefined>((longest, name) => (name.length > (longest?.length ?? -1) ? name : longest), undefined);
