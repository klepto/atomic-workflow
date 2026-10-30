import { z } from 'zod';
import { parseJson, TOOL_RESULT_MARK } from './claude-entry.ts';
import type { TranscriptTask } from './find-transcript.ts';

/**
 * Text that every line of a Claude Code transcript with a call to a tool of `TASK_TOOL` holds, which a line is searched
 * for before it is parsed, since most lines hold none.
 */
const TASK_TOOL_MARK = 'atomic-workflow__task';

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
 * Text that every line of a Claude Code transcript with a call to the tool of `TICKET_TOOL` holds: the name of the
 * tool `worktreeCreate` of the MCP server `atomic-workflow`, after the prefix that Claude Code gives the tools of the
 * server.
 */
const TICKET_TOOL_MARK = 'atomic-workflow__worktreeCreate';

/**
 * Pattern of the name of the tool of the MCP server `atomic-workflow` whose result names a ticket, `worktreeCreate`,
 * with the prefix that Claude Code gives the tools of the server: a name that ends with `TICKET_TOOL_MARK`.
 */
const TICKET_TOOL = new RegExp(`${TICKET_TOOL_MARK}$`);

/**
 * Schema of the fields of an entry of a Claude Code transcript that a call to a tool or its result needs: the name and
 * the id of each call, and for each result the call that it answers, whether it failed, and its content. The format
 * is internal to Claude Code, so every other field may be missing or change.
 */
const TOOL_CALL_ENTRY = z.object({
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
const TEXT_RESULT = z.tuple([z.object({ type: z.literal('text'), text: z.string() })]);

/**
 * Schema of the task that the result of a tool of `TASK_TOOL` holds, with only its id and its slug.
 */
const TASK_ID = z.object({ id: z.number().int().positive(), slug: z.string().min(1) });

/**
 * Schema of the result of the tool of `TICKET_TOOL`, with only the id of its ticket.
 */
const TICKET_OF_RESULT = z.object({ ticket: z.object({ id: z.number().int().positive() }) });

/**
 * Returns the task that the line `line` of a Claude Code transcript, with `value`, the value of its JSON, holds as the
 * result of a call to a tool of `TASK_TOOL`. `calls` holds the calls to those tools that earlier lines made and that
 * have no result yet, by id, with the name of their tool. The function adds the calls of the line to it, and removes
 * the call of each result, so the lines of one transcript must pass with the same `calls`, in their order. If the line
 * holds no result of such a call, or the call failed, returns `undefined` instead.
 */
export const parseTask = (line: string, value: unknown, calls: Map<string, string>): TranscriptTask | undefined =>
  parseResult(line, value, calls, TASK_TOOL, TASK_TOOL_MARK, (content, tool) =>
    taskOf(content, tool === TASK_CREATE_TOOL),
  );

/**
 * Returns the id of the ticket that the line `line` of a Claude Code transcript, with `value`, the value of its JSON,
 * holds as the result of a call to the tool of `TICKET_TOOL`. `calls` works as for `parseTask`, for the calls to that
 * tool. If the line holds no result of such a call, or the call failed, returns `undefined` instead.
 */
export const parseTicketId = (line: string, value: unknown, calls: Map<string, string>): number | undefined =>
  parseResult(line, value, calls, TICKET_TOOL, TICKET_TOOL_MARK, ticketIdOf);

/**
 * Returns what `readValue` finds in the line `line`, with `value`, the value of its JSON, as the result of one of the
 * calls `calls`, and removes that call from `calls`. Adds to `calls` the id of each call to a tool of `tool` that the
 * line holds, with the name of the tool: the first group of `tool`, or else the whole match. `readValue` takes the
 * content of the result and the name of the tool of its call. Only a line that holds `mark`, or a result while a call
 * waits for one, is parsed. If the line holds no result of such a call, or the call failed, returns `undefined`
 * instead.
 */
const parseResult = <T>(
  line: string,
  value: unknown,
  calls: Map<string, string>,
  tool: RegExp,
  mark: string,
  readValue: (content: unknown, tool: string) => T | undefined,
): T | undefined => {
  if (!line.includes(mark) && (calls.size === 0 || !line.includes(TOOL_RESULT_MARK))) return undefined;
  const entry = TOOL_CALL_ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  let result: T | undefined;
  for (const part of entry.data.message.content) {
    const match = tool.exec(part.name ?? '');
    if (part.type === 'tool_use' && part.id !== undefined && match !== null) calls.set(part.id, match[1] ?? match[0]);
    if (part.type !== 'tool_result' || part.tool_use_id === undefined) continue;
    const name = calls.get(part.tool_use_id);
    if (name === undefined) continue;
    calls.delete(part.tool_use_id);
    result ??= part.is_error === true ? undefined : readValue(part.content, name);
  }
  return result;
};

/**
 * Returns the task that the content `content` of the result of a tool of `TASK_TOOL` holds, which the call created
 * when `created` is true. If it holds no task, such as the message of a failure, returns `undefined` instead.
 */
const taskOf = (content: unknown, created: boolean): TranscriptTask | undefined => {
  const result = TEXT_RESULT.safeParse(content);
  if (!result.success) return undefined;
  const task = TASK_ID.safeParse(parseJson(result.data[0].text));
  return task.success ? { taskId: task.data.id, slug: task.data.slug, created } : undefined;
};

/**
 * Returns the id of the ticket that the content `content` of the result of the tool of `TICKET_TOOL` holds. If it
 * holds no ticket, such as the message of a failure, returns `undefined` instead.
 */
const ticketIdOf = (content: unknown): number | undefined => {
  const result = TEXT_RESULT.safeParse(content);
  if (!result.success) return undefined;
  const ticketResult = TICKET_OF_RESULT.safeParse(parseJson(result.data[0].text));
  return ticketResult.success ? ticketResult.data.ticket.id : undefined;
};
