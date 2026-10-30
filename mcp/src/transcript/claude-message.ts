import { z } from 'zod';
import { ENTRY, SENDERS, TOOL_RESULT_MARK, textOf } from './claude-entry.ts';
import type { TranscriptMessage } from './find-transcript.ts';

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
 * Returns the message of a user or an agent that the line `line` of a Claude Code transcript holds, with `value`, the
 * value of its JSON. With `sidechain`, only the entries of a subagent are messages, and without it, only the entries
 * of the session itself. Entries that only Claude Code wrote, such as the text of a skill, are no messages, and
 * neither are summaries of a compaction, tool calls, tool results and thinking. Neither is the notice that a wait for
 * the messages of the atomic-workflow server ended: the function adds to `awaitIds` the id of each call that runs the
 * wait and of the background task that the call started, and a message of the user that names one of them is no
 * message. A wait may end in another transcript than the one that started it, such as after `/clear`, so `awaitIds`
 * is shared by the transcripts of one process, which must pass their lines in their order. If the line holds no
 * message, returns `undefined` instead.
 */
export const parseMessage = (
  line: string,
  value: unknown,
  sidechain: boolean,
  awaitIds: Set<string>,
): TranscriptMessage | undefined => {
  keepAwaitIds(line, value, awaitIds);
  const message = messageOf(value, sidechain);
  return message?.sender === 'user' && namesAny(message.content, awaitIds) ? undefined : message;
};

/**
 * Adds to `awaitIds` the ids that the entry `value` of the line `line` of a Claude Code transcript holds of a wait for
 * the messages of the atomic-workflow server: the id of each call of a tool whose command holds `AWAIT_COMMAND_MARK`,
 * and the id of the background task that a result of one of those calls started.
 */
const keepAwaitIds = (line: string, value: unknown, awaitIds: Set<string>): void => {
  if (!line.includes(AWAIT_COMMAND_MARK) && (awaitIds.size === 0 || !line.includes(TOOL_RESULT_MARK))) return;
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
const namesAny = (text: string, ids: ReadonlySet<string>): boolean => {
  for (const id of ids) if (text.includes(id)) return true;
  return false;
};

/**
 * Returns the message of a user or an agent that the entry `value` of a Claude Code transcript holds, as
 * `parseMessage` describes it for `sidechain`, without the waits for the messages of the atomic-workflow server. If
 * the entry holds no message, returns `undefined` instead.
 */
const messageOf = (value: unknown, sidechain: boolean): TranscriptMessage | undefined => {
  const entry = ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { type, uuid, timestamp, isMeta, isSidechain = false, isCompactSummary, message } = entry.data;
  const sender = SENDERS.get(type);
  if (sender === undefined || isMeta || isSidechain !== sidechain || isCompactSummary) return undefined;
  const content = textOf(message.content);
  return content === '' ? undefined : { messageId: uuid, sender, content, timestamp: Date.parse(timestamp) };
};
