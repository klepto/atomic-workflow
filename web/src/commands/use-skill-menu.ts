import { type KeyboardEvent, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Skill } from '@/api/types.ts';
import { bestMatchIndex, insertSkill, isSlashWord, matchSkills, skillOptionId } from '@/commands/skill-commands.ts';

/**
 * Options of the skill menu of one text box.
 */
interface SkillMenuOptions {
  /**
   * Text of the box.
   */
  readonly text: string;

  /**
   * Replaces the text of the box with `text`.
   */
  readonly setText: (text: string) => void;

  /**
   * Ref of the text box.
   */
  readonly field: RefObject<HTMLTextAreaElement | null>;

  /**
   * Skills to offer, or `undefined` while they are not known yet.
   */
  readonly skills: readonly Skill[] | undefined;

  /**
   * Called each time the menu opens.
   */
  readonly onOpen: () => void;
}

/**
 * State of the skill menu of one text box, and the handlers that the box and the menu use.
 */
interface SkillMenuState {
  /**
   * Whether the menu is open. An open menu may offer no skill, such as when no skill matches the text.
   */
  readonly open: boolean;

  /**
   * Skills that the menu offers, the main skills first and the helper skills after them, as `matchSkills` orders
   * them. Empty while the menu is closed.
   */
  readonly matches: readonly Skill[];

  /**
   * Index of the highlighted skill in `matches`.
   */
  readonly active: number;

  /**
   * Id of the listbox of the menu.
   */
  readonly menuId: string;

  /**
   * Handles a key that the user pressed in the box. Returns `true` when the menu used the key, so the box must not
   * handle it too.
   */
  readonly handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;

  /**
   * Highlights the skill at `index` in `matches`, such as when the pointer moves over it.
   */
  readonly highlight: (index: number) => void;

  /**
   * Sets the text of the box for `skill`, keeps the focus in the box and puts the caret at the end.
   */
  readonly pick: (skill: Skill) => void;

  /**
   * ARIA attributes of the box. Empty while the menu is closed.
   */
  readonly fieldProps: Readonly<Record<string, string | boolean | undefined>>;
}

/**
 * Returns the state of the skill menu of one text box, from the options `options`. The menu opens while the whole text
 * is a slash and a word without whitespace, and calls `onOpen` each time it opens. Each time the list of matches
 * changes, the best match is highlighted, which may be a helper skill below the main skills. ArrowDown and ArrowUp
 * move the highlight with wrap through both groups, Enter and Tab pick the highlighted skill, and Escape closes the
 * menu until the text changes. Enter on a text that is the highlighted skill already, or while no skill matches, is
 * left to the box. A key during the composition of an input method is left alone.
 */
export const useSkillMenu = (options: SkillMenuOptions): SkillMenuState => {
  const { text, setText, field, skills, onOpen } = options;
  const menuId = useId();
  const matched = matchSkills(text, skills ?? []);
  const listKey = matched.map((skill) => skill.name).join(' ');
  const best = bestMatchIndex(text, matched);
  const [seenText, setSeenText] = useState(text);
  const [seenListKey, setSeenListKey] = useState(listKey);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(best);
  const caretToEnd = useRef(false);

  // Adjusts the state during the render as soon as the text or the list changes, so no render shows a stale state.
  if (seenText !== text) {
    setSeenText(text);
    setDismissed(false);
  }
  if (seenListKey !== listKey) {
    setSeenListKey(listKey);
    setActive(best);
  }
  // The rest of this render still sees the old index, which may lie past the end of the new list.
  const highlighted = seenListKey === listKey ? active : best;

  const open = isSlashWord(text) && !dismissed;
  const matches = open ? matched : [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: the skills are read again only when the menu opens.
  useEffect(() => {
    if (open) {
      onOpen();
    }
  }, [open]);

  useLayoutEffect(() => {
    const box = field.current;
    if (!caretToEnd.current || box === null) {
      return;
    }
    caretToEnd.current = false;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  });

  /**
   * Sets the text of the box for `skill`, and asks the next layout for the focus and the caret at the end.
   */
  const pick = (skill: Skill): void => {
    caretToEnd.current = true;
    setText(insertSkill(skill));
    field.current?.focus();
  };

  /**
   * Returns whether a pick of `skill` changes the text of the box, other than by a space at its end.
   */
  const changes = (skill: Skill): boolean => insertSkill(skill).trimEnd() !== text;

  /**
   * Returns the action of the open menu for the key `key`. Without a match, the menu only uses Escape. Enter is left to
   * the box when the text is the highlighted skill already, so that the box sends it. If the menu does not use the key,
   * returns `undefined` instead.
   */
  const actionOf = (key: string): (() => void) | undefined => {
    const current = matches[highlighted];
    const actions: Record<string, (() => void) | undefined> =
      current === undefined
        ? { Escape: () => setDismissed(true) }
        : {
            ArrowDown: () => setActive((highlighted + 1) % matches.length),
            ArrowUp: () => setActive((highlighted - 1 + matches.length) % matches.length),
            Enter: changes(current) ? () => pick(current) : undefined,
            Tab: () => pick(current),
            Escape: () => setDismissed(true),
          };
    return Object.hasOwn(actions, key) ? actions[key] : undefined;
  };

  /**
   * Runs the action of the open menu for the key of `event`. Returns `true` when the menu used the key.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const action = open && !event.nativeEvent.isComposing ? actionOf(event.key) : undefined;
    if (action === undefined) {
      return false;
    }
    event.preventDefault();
    action();
    return true;
  };

  const current = matches[highlighted];
  const fieldProps = open
    ? {
        'aria-expanded': true,
        'aria-controls': menuId,
        'aria-activedescendant': current === undefined ? undefined : skillOptionId(menuId, current),
        'aria-autocomplete': 'list',
      }
    : {};

  return { open, matches, active: highlighted, menuId, handleKeyDown, highlight: setActive, pick, fieldProps };
};
