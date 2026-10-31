import { z } from 'zod';
import type { MessageSender } from '../storage/message-log-store.ts';

/**
 * Schema of the fields of an entry of a Claude Code transcript that a message or a status needs. `stop_reason` is
 * `end_turn` on each entry of the agent that ends its turn. `queueTranscriptOnly` is `true` on each message that Claude
 * Code only writes to the transcript, and that starts no turn, such as the notice of a background task that arrives
 * while the agent is idle. The format is internal to Claude Code, so every field that a message does not need may be
 * missing or change.
 */
export const ENTRY = z.object({
  type: z.string(),
  uuid: z.string(),
  timestamp: z.iso.datetime(),
  isMeta: z.boolean().optional(),
  queueTranscriptOnly: z.boolean().optional().catch(undefined),
  isSidechain: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]),
    stop_reason: z.string().nullish().catch(undefined),
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
export const SENDERS: ReadonlyMap<string, MessageSender> = new Map([
  ['user', 'user'],
  ['assistant', 'agent'],
]);

/**
 * Text that each line of a Claude Code transcript with the result of a call to a tool holds, which a line is searched
 * for before it is parsed, since most lines hold none.
 */
export const TOOL_RESULT_MARK = '"tool_result"';

/**
 * Returns the value of the JSON text `text`. If `text` is not valid JSON, returns `undefined` instead.
 */
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Returns the text of the content `content` of an entry, with its text blocks apart by an empty line.
 */
export const textOf = (content: Content): string => {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n\n');
};
