import { z } from 'zod';
import type { TranscriptUsage } from './find-transcript.ts';

/**
 * Schema of the fields of an entry of a Claude Code transcript that the token usage of a model request needs. Claude
 * Code writes one entry for each block of a reply, each with the usage of the whole request. The format is internal
 * to Claude Code, so every other field may be missing or change.
 */
const USAGE_ENTRY = z.object({
  type: z.literal('assistant'),
  timestamp: z.iso.datetime(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  effort: z.string().min(1).optional().catch(undefined),
  message: z.object({
    model: z.string().optional(),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      cache_creation_input_tokens: z.number().int().nonnegative().nullish(),
      cache_read_input_tokens: z.number().int().nonnegative().nullish(),
    }),
  }),
});

/**
 * Model that Claude Code names in an entry that it wrote itself in place of a reply, such as an API error, whose usage
 * is zero.
 */
const SYNTHETIC_MODEL = '<synthetic>';

/**
 * Text that each line of a Claude Code transcript with a token usage holds, which a line is searched for before it is
 * parsed.
 */
const USAGE_MARK = '"usage"';

/**
 * Returns the token usage of the model request that the line `line` of a Claude Code transcript holds the reply of,
 * with `value`, the value of its JSON. With `sidechain`, only the entries of a subagent count, and without it, only
 * the entries of the session itself. An entry of `SYNTHETIC_MODEL`, which Claude Code wrote in place of a reply, holds
 * no usage of a request, so the function returns `undefined` for it, as for every other line.
 */
export const parseUsage = (line: string, value: unknown, sidechain: boolean): TranscriptUsage | undefined => {
  if (!line.includes(USAGE_MARK)) return undefined;
  const entry = USAGE_ENTRY.safeParse(value);
  if (!entry.success) return undefined;
  const { timestamp, isMeta, isSidechain = false, effort, message } = entry.data;
  if (isMeta || isSidechain !== sidechain || message.model === SYNTHETIC_MODEL) return undefined;
  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } = message.usage;
  const contextTokens = input_tokens + (cache_creation_input_tokens ?? 0) + (cache_read_input_tokens ?? 0);
  const model = message.model || null;
  return { contextTokens, model, effort: effort ?? null, timestamp: Date.parse(timestamp) };
};
