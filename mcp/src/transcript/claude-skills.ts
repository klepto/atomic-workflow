import { z } from 'zod';
import type { SkillListing, TranscriptSkill } from './find-transcript.ts';

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
 * Text that every line of a Claude Code transcript with a list of skills holds, which a line is searched for before
 * it is parsed, since most lines hold none.
 */
const SKILL_LISTING_MARK = '"skill_listing"';

/**
 * Returns the list of skills that the line `line` of a Claude Code transcript holds, with `value`, the value of its
 * JSON. With `sidechain`, only the entries of a subagent count, and without it, only the entries of the session
 * itself. If the line holds no list of skills, returns `undefined` instead.
 */
export const parseSkillListing = (line: string, value: unknown, sidechain: boolean): SkillListing | undefined => {
  if (!line.includes(SKILL_LISTING_MARK)) return undefined;
  const entry = SKILL_LISTING.safeParse(value);
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
