import { z } from 'zod';
import type { TranscriptAction } from './find-transcript.ts';

/**
 * Schema of the fields of an entry of a Claude Code transcript that an action of the agent needs: the text of each text
 * block, and the name and the input of each call of a tool. The format is internal to Claude Code, so every other field
 * may be missing or change.
 */
const ACTION_ENTRY = z.object({
  type: z.literal('assistant'),
  timestamp: z.iso.datetime(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  message: z.object({
    content: z.union([
      z.string(),
      z.array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
          name: z.string().optional(),
          input: z.record(z.string(), z.unknown()).optional().catch(undefined),
        }),
      ),
    ]),
  }),
});

/**
 * Text that each line of a Claude Code transcript with an entry of the agent holds, which a line is searched for before
 * it is parsed.
 */
const ASSISTANT_MARK = '"assistant"';

/**
 * Field of the input of a tool that names its target, by the name of the tool. A tool that is not listed uses its
 * first field that holds a text.
 */
const MAIN_ARGUMENTS: ReadonlyMap<string, string> = new Map([
  ['Bash', 'command'],
  ['PowerShell', 'command'],
  ['Read', 'file_path'],
  ['Write', 'file_path'],
  ['Edit', 'file_path'],
  ['Grep', 'pattern'],
  ['Glob', 'pattern'],
  ['Skill', 'skill'],
  ['Agent', 'description'],
]);

/**
 * Greatest number of characters of an action, its ellipsis included.
 */
const ACTION_MAX_LENGTH = 200;

/**
 * Text that ends an action that was cut to `ACTION_MAX_LENGTH` characters.
 */
const ELLIPSIS = '…';

/**
 * Returns the newest action of the agent that the line `line` of a Claude Code transcript shows, with `value`, the
 * value of its JSON. With `sidechain`, only the entries of a subagent count, and without it, only the entries of the
 * session itself. The blocks of the entry count in their order: a call of a tool sets the action, as `actionOf` words
 * it, and a text block that is not empty clears it. If the entry holds neither, or is no entry of the agent, returns
 * `undefined` instead.
 */
export const parseAction = (line: string, value: unknown, sidechain: boolean): TranscriptAction | undefined => {
  if (!line.includes(ASSISTANT_MARK)) return undefined;
  const entry = ACTION_ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { timestamp, isMeta, isSidechain = false, isCompactSummary, message } = entry.data;
  if (isMeta || isSidechain !== sidechain || isCompactSummary) return undefined;
  const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
  let action: string | null | undefined;
  for (const block of blocks) {
    if (block.type === 'tool_use' && block.name !== undefined) action = actionOf(block.name, block.input ?? {});
    else if (block.type === 'text' && (block.text ?? '').trim() !== '') action = null;
  }
  return action === undefined ? undefined : { action, timestamp: Date.parse(timestamp) };
};

/**
 * Returns the action of a call of the tool `name` with the input `input`, in one line: the name of the tool, a colon,
 * and its main argument, as `MAIN_ARGUMENTS` names it, with each line break as a space. A tool with no text in its
 * input is its name only. The action is cut to `ACTION_MAX_LENGTH` characters, with `ELLIPSIS` at its end.
 */
const actionOf = (name: string, input: Readonly<Record<string, unknown>>): string => {
  const field = MAIN_ARGUMENTS.get(name);
  const main = field === undefined ? undefined : input[field];
  const argument = typeof main === 'string' ? main : Object.values(input).find((value) => typeof value === 'string');
  const action = typeof argument === 'string' ? `${name}: ${argument.replace(/\r\n|\r|\n/g, ' ')}` : name;
  return action.length > ACTION_MAX_LENGTH
    ? `${action.slice(0, ACTION_MAX_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`
    : action;
};
