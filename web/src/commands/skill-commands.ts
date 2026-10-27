import type { Skill } from '@/api/types.ts';

/**
 * Prefix of the name of each skill of the atomic workflow: the name of its plugin and a colon.
 */
const WORKFLOW_PREFIX = 'atomic-workflow:';

/**
 * Names of the main skills of the atomic workflow, the steps of a task in the order that the user runs them.
 */
const MAIN_SKILLS: readonly string[] = ['plan', 'implement', 'approve'].map((command) => WORKFLOW_PREFIX + command);

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
 * Group of a skill in the menu: `main` for the steps of a task, plan, implement and approve, and `helper` for every
 * other skill.
 */
export type SkillGroup = 'main' | 'helper';

/**
 * The groups of the menu, in the order that the menu shows them.
 */
export const SKILL_GROUPS: readonly SkillGroup[] = ['main', 'helper'];

/**
 * A skill that the text matches, and how well, as `rankOf` ranks it.
 */
interface Match {
  /**
   * The skill that the text matches.
   */
  skill: Skill;

  /**
   * How well the text matches the skill, the best match lowest.
   */
  rank: number;
}

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
 * Returns the group of the skill `skill` in the menu.
 */
export const groupOf = (skill: Skill): SkillGroup => (MAIN_SKILLS.includes(skill.name) ? 'main' : 'helper');

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
 * Returns the order of the matches `first` and `second` in the menu: by group, in the order of `SKILL_GROUPS`, then by
 * rank, then the main skills in the order of their steps. Helper skills of the same rank keep their order.
 */
const compareMatches = (first: Match, second: Match): number =>
  SKILL_GROUPS.indexOf(groupOf(first.skill)) - SKILL_GROUPS.indexOf(groupOf(second.skill)) ||
  first.rank - second.rank ||
  MAIN_SKILLS.indexOf(first.skill.name) - MAIN_SKILLS.indexOf(second.skill.name);

/**
 * Returns the skills of `skills` whose command holds the letters typed after the slash of `text`, in any case. The main
 * skills come first and the helper skills after them, and within each group the best matches come first, as `rankOf`
 * ranks them. Main skills of the same rank follow the order of their steps, and helper skills of the same rank keep the
 * order of `skills`. A slash alone matches every skill. If `text` is not a slash and a word without whitespace, returns
 * an empty list instead.
 */
export const matchSkills = (text: string, skills: readonly Skill[]): readonly Skill[] => {
  if (!isSlashWord(text)) {
    return [];
  }
  const typed = text.slice(1).toLowerCase();
  return skills
    .map((skill) => ({ skill, rank: rankOf(skill, typed) }))
    .filter((match): match is Match => match.rank !== undefined)
    .toSorted(compareMatches)
    .map((match) => match.skill);
};

/**
 * Returns the index in `matches`, the skills that the text `text` matches, of the best match: the first skill whose
 * command starts with the letters typed after the slash, in any case. If no command starts with them, returns 0
 * instead.
 */
export const bestMatchIndex = (text: string, matches: readonly Skill[]): number => {
  const typed = text.slice(1).toLowerCase();
  return Math.max(
    0,
    matches.findIndex((skill) => rankOf(skill, typed) === 0),
  );
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
