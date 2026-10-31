import type { Skill } from '@/api/types.ts';
import { insertSkill } from '@/commands/skill-commands.ts';

/**
 * Action of the skill menu that moves the highlight.
 */
interface HighlightAction {
  /**
   * Kind of the action.
   */
  readonly kind: 'highlight';

  /**
   * Index in the matches of the skill to highlight.
   */
  readonly index: number;
}

/**
 * Action of the skill menu that picks a skill.
 */
interface PickAction {
  /**
   * Kind of the action.
   */
  readonly kind: 'pick';

  /**
   * Skill to pick.
   */
  readonly skill: Skill;
}

/**
 * Action of the skill menu that closes it until the text changes.
 */
interface DismissAction {
  /**
   * Kind of the action.
   */
  readonly kind: 'dismiss';
}

/**
 * Action of the open skill menu for a key.
 */
export type MenuKeyAction = HighlightAction | PickAction | DismissAction;

/**
 * Returns the action of the open skill menu for the key `key`, while the box holds the text `text`, the menu offers
 * the skills `matches`, and the skill at `highlighted` in `matches` is highlighted. ArrowDown and ArrowUp move the
 * highlight with wrap, Enter and Tab pick the highlighted skill, and Escape closes the menu. Without a match, the menu
 * only uses Escape. Enter is left to the box when a pick of the highlighted skill would not change the text other than
 * by a space at its end, so that the box sends it. If the menu does not use the key, returns `undefined` instead.
 */
export const menuKeyAction = (
  key: string,
  text: string,
  matches: readonly Skill[],
  highlighted: number,
): MenuKeyAction | undefined => {
  if (key === 'Escape') {
    return { kind: 'dismiss' };
  }
  const current = matches[highlighted];
  if (current === undefined) {
    return undefined;
  }
  switch (key) {
    case 'ArrowDown':
      return { kind: 'highlight', index: (highlighted + 1) % matches.length };
    case 'ArrowUp':
      return { kind: 'highlight', index: (highlighted - 1 + matches.length) % matches.length };
    case 'Enter':
      return insertSkill(current).trimEnd() === text ? undefined : { kind: 'pick', skill: current };
    case 'Tab':
      return { kind: 'pick', skill: current };
    default:
      return undefined;
  }
};
