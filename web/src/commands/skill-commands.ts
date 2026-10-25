import type { Skill } from '@/api/types.ts';

/**
 * Prefix of the name of each skill of the atomic workflow: the name of its plugin and a colon.
 */
const WORKFLOW_PREFIX = 'atomic-workflow:';

/**
 * Pattern of a text that is a slash and a word without whitespace, which the menu opens for.
 */
const SLASH_WORD = /^\/\S*$/;

/**
 * Pattern of a text that starts with a slash and a word, up to a whitespace or the end of the text. The word is its
 * first group.
 */
const LEADING_WORD = /^\/(\S+)(?=\s|$)/;

/**
 * Returns the skills of `skills` that belong to the atomic workflow, in the order of `skills`.
 */
export const workflowSkills = (skills: readonly Skill[]): readonly Skill[] =>
  skills.filter((skill) => skill.name.startsWith(WORKFLOW_PREFIX));

/**
 * Returns the command of the skill `skill`, the name that the menu shows and the user types after the slash: its name
 * without the prefix of the atomic workflow, such as `plan` for `atomic-workflow:plan`.
 */
export const commandOf = (skill: Skill): string =>
  skill.name.startsWith(WORKFLOW_PREFIX) ? skill.name.slice(WORKFLOW_PREFIX.length) : skill.name;

/**
 * Returns whether the menu opens for the whole text `text`: a slash followed by a word without whitespace, such as
 * `/plan`, or the slash alone.
 */
export const isSlashWord = (text: string): boolean => SLASH_WORD.test(text);

/**
 * Returns how well the skill `skill` matches the letters `typed`, lower case: 0 when its command starts with them, and
 * 1 when its command holds them. If the command does not hold them, returns `undefined` instead.
 */
const rankOf = (skill: Skill, typed: string): number | undefined => {
  const command = commandOf(skill).toLowerCase();
  const rank = [command.startsWith(typed), command.includes(typed)].indexOf(true);
  return rank === -1 ? undefined : rank;
};

/**
 * Returns the skills of `skills` whose command holds the letters typed after the slash of `text`, in any case. The
 * best matches come first, as `rankOf` ranks them, and skills of the same rank keep the order of `skills`. A slash
 * alone matches every skill. If `text` is not a slash and a word without whitespace, returns an empty list instead.
 */
export const matchSkills = (text: string, skills: readonly Skill[]): readonly Skill[] => {
  if (!isSlashWord(text)) {
    return [];
  }
  const typed = text.slice(1).toLowerCase();
  return skills
    .map((skill) => ({ skill, rank: rankOf(skill, typed) }))
    .filter((match): match is { skill: Skill; rank: number } => match.rank !== undefined)
    .toSorted((first, second) => first.rank - second.rank)
    .map((match) => match.skill);
};

/**
 * Returns the skill of `skills` that `text` runs: a slash and the exact command or name of the skill at the start of
 * the text, followed by a whitespace or the end, such as `/plan 3` or `/atomic-workflow:plan 3`. Whitespace before the
 * slash is ignored. If the text runs no skill of `skills`, such as `/compact`, returns `undefined` instead.
 */
export const skillOf = (text: string, skills: readonly Skill[]): Skill | undefined => {
  const word = LEADING_WORD.exec(text.trimStart())?.[1];
  return word === undefined ? undefined : skills.find((skill) => commandOf(skill) === word || skill.name === word);
};

/**
 * Returns the text `text`, which runs the skill `skill`, as the agent runs it: the slash and the word at its start
 * become the slash and the whole name of the skill, such as `/atomic-workflow:plan 3` for `/plan 3`. Whitespace before
 * the slash is dropped.
 */
export const expandCommand = (text: string, skill: Skill): string =>
  text.trimStart().replace(LEADING_WORD, () => `/${skill.name}`);

/**
 * Returns the text that the box holds once the user picked the skill `skill` from the menu: the slash, the command of
 * the skill and a space for its arguments.
 */
export const insertSkill = (skill: Skill): string => `/${commandOf(skill)} `;
