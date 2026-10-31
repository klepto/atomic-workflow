import { z } from 'zod';
import { ENTRY, SENDERS, textOf } from './claude-entry.ts';
import type { TranscriptActivity } from './find-transcript.ts';

/**
 * Stop reason of an entry of the agent that ends its turn.
 */
const END_TURN = 'end_turn';

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
 * Texts that Claude Code starts a message of the user with for a local command, such as `/clear` or a shell command of
 * the bash mode, and for its output. A local command runs no turn, so no `Stop` hook ends it.
 */
const LOCAL_COMMAND_MARKS: readonly string[] = ['<command-', '<local-command-', '<bash-'];

/**
 * Returns the status of the agent that the line `line` of a Claude Code transcript shows, with `value`, the value of
 * its JSON. With `sidechain`, only the entries of a subagent count, and without it, only the entries of the session
 * itself. Each entry of the user or the agent shows that a turn runs, tool calls and tool results included. A message
 * of the user that marks an interrupt shows that the turn ended, and so does an entry of a subagent that ends its
 * turn, as `endsSubagentTurn` tells. Entries that only Claude Code wrote, messages that only sit in the transcript and
 * start no turn, summaries of a compaction, a local command and its output, and every other entry, such as the time
 * that Claude Code notes after a turn, show no status, and neither does a line that is not valid, so the function
 * returns `undefined` for them.
 */
export const parseActivity = (line: string, value: unknown, sidechain: boolean): TranscriptActivity | undefined => {
  const entry = ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { type, timestamp, isMeta, queueTranscriptOnly, isSidechain = false, isCompactSummary, message } = entry.data;
  if (!SENDERS.has(type) || isMeta || queueTranscriptOnly || isSidechain !== sidechain || isCompactSummary) {
    return undefined;
  }
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
