import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { parseJson, TOOL_RESULT_MARK } from './claude-entry.ts';

/**
 * Text that each line of a Claude Code transcript with a call to a tool holds, which a line is searched for before it
 * is parsed, since most lines hold none.
 */
const TOOL_USE_MARK = '"tool_use"';

/**
 * Start of the text that Claude Code writes to the transcript when the user interrupts a turn, such as
 * `[Request interrupted by user]` or `[Request interrupted by user for tool use]`.
 */
const INTERRUPT_MARK = '[Request interrupted by user';

/**
 * Types of the entries of a Claude Code transcript that hold the messages of the conversation. Other entries, such as
 * the records of the requests to the API, repeat earlier messages, so they are skipped.
 */
const MESSAGE_TYPES: ReadonlySet<string> = new Set(['user', 'assistant']);

/**
 * Schema of the fields of an entry of a Claude Code transcript that a tool call, its result or an interrupt needs. The
 * format is internal to Claude Code, so every other field may be missing or change.
 */
const ANSWER_ENTRY = z.object({
  type: z.string(),
  message: z.object({
    content: z.union([
      z.string(),
      z.array(
        z.object({
          type: z.string(),
          id: z.string().optional(),
          name: z.string().optional(),
          input: z.unknown().optional(),
          tool_use_id: z.string().optional(),
          text: z.string().optional(),
        }),
      ),
    ]),
  }),
});

/**
 * Tool call that waits on a permission prompt.
 */
export interface ToolCall {
  /**
   * Name of the tool of the call.
   */
  readonly toolName: string;

  /**
   * Input of the tool call, as the hook of Claude Code gave it.
   */
  readonly toolInput: unknown;
}

/**
 * State of the watch of a transcript for the answer of a tool call, which the lines of the transcript update in their
 * order.
 */
export interface ToolAnswerWatch {
  /**
   * Calls of the tool of the watched call that have no result yet, by id, with whether their input equals the input of
   * the watched call.
   */
  readonly pending: Map<string, boolean>;

  /**
   * Ids of the calls whose result the transcript holds.
   */
  readonly answered: Set<string>;
}

/**
 * Returns a new watch, which has read no line yet.
 */
export const createToolAnswerWatch = (): ToolAnswerWatch => ({ pending: new Map(), answered: new Set() });

/**
 * Reads the lines `lines` of a Claude Code transcript, which were written before the watch started, into `watch`, for
 * the tool call `call`. A call of the tool of `call` that has no result yet is pending, and a result or an interrupt
 * in them answers nothing.
 */
export const readEarlierLines = (lines: readonly string[], call: ToolCall, watch: ToolAnswerWatch): void => {
  for (const line of lines) readLine(line, call, watch);
};

/**
 * Reads the lines `lines` of a Claude Code transcript, which were appended after the watch started, into `watch`, and
 * returns whether they show that the tool call `call` was answered outside of the hook: an interrupt of the user, or a
 * result of a pending call of the tool of `call` whose input equals the input of `call`. When no pending call has an
 * equal input, since Claude Code can give a hook another form of the input than the transcript holds, a result of any
 * pending call of the tool counts.
 */
export const isAnsweredBy = (lines: readonly string[], call: ToolCall, watch: ToolAnswerWatch): boolean => {
  let answered = false;
  for (const line of lines) answered = readLine(line, call, watch) || answered;
  return answered;
};

/**
 * Reads the line `line` into `watch` for the tool call `call`, and returns whether it holds an interrupt, or a result
 * of a pending call that answers `call`.
 */
const readLine = (line: string, call: ToolCall, watch: ToolAnswerWatch): boolean => {
  if (!line.includes(TOOL_USE_MARK) && !line.includes(TOOL_RESULT_MARK) && !line.includes(INTERRUPT_MARK)) {
    return false;
  }
  const entry = ANSWER_ENTRY.safeParse(parseJson(line));
  if (!entry.success || !MESSAGE_TYPES.has(entry.data.type)) return false;
  const { content } = entry.data.message;
  if (typeof content === 'string') return content.startsWith(INTERRUPT_MARK);
  let answered = false;
  for (const block of content) {
    if (block.type === 'text' && block.text?.startsWith(INTERRUPT_MARK) === true) answered = true;
    if (block.type === 'tool_use' && block.name === call.toolName && block.id !== undefined) {
      if (!watch.answered.has(block.id)) watch.pending.set(block.id, isDeepStrictEqual(block.input, call.toolInput));
    }
    if (block.type === 'tool_result' && block.tool_use_id !== undefined) {
      answered = readResult(block.tool_use_id, watch) || answered;
    }
  }
  return answered;
};

/**
 * Marks the call `id` answered in `watch`, and returns whether its result answers the watched call: the call is pending,
 * and its input equals the input of the watched call, or no pending call has an equal input.
 */
const readResult = (id: string, watch: ToolAnswerWatch): boolean => {
  watch.answered.add(id);
  const exact = watch.pending.get(id);
  if (exact === undefined) return false;
  const anyExact = [...watch.pending.values()].some((equal) => equal);
  watch.pending.delete(id);
  return exact || !anyExact;
};
