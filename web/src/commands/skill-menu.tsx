import { type ReactNode, useEffect } from 'react';
import type { Skill } from '@/api/types.ts';
import { cn } from '@/lib/utils.ts';
import { commandOf, groupOf, SKILL_GROUPS, type SkillGroup } from './skill-commands.ts';
import { skillOptionId } from './use-skill-menu.ts';

/**
 * Props of the skill menu.
 */
export interface SkillMenuProps {
  /**
   * The id of the listbox. The id of each option is this id, a hyphen and the name of its skill, and the id of the
   * heading of each group is this id, a hyphen and the group.
   */
  id: string;

  /**
   * The text of the box, a slash and the letters typed after it.
   */
  text: string;

  /**
   * The skills that the session can run, or `undefined` while they are not known yet.
   */
  skills: readonly Skill[] | undefined;

  /**
   * The message of the latest failed read of the skills, or `null` when none failed.
   */
  failure: string | null;

  /**
   * The skills to offer, the skills of each group together and the groups in the order of `SKILL_GROUPS`.
   */
  matches: readonly Skill[];

  /**
   * The index of the highlighted skill in `matches`.
   */
  active: number;

  /**
   * Highlights the skill at `index` in `matches`.
   */
  onHighlight: (index: number) => void;

  /**
   * Takes the skill that the user pressed with the mouse.
   */
  onPick: (skill: Skill) => void;
}

/**
 * The heading of each group of the menu.
 */
const GROUP_HEADINGS: Record<SkillGroup, string> = {
  main: 'Main skills',
  helper: 'Helper skills',
};

/**
 * Returns the groups of the menu that hold some of the skills `matches`, each with its skills in the order of
 * `matches`.
 */
const groupsOf = (matches: readonly Skill[]) =>
  SKILL_GROUPS.map((group) => ({ group, skills: matches.filter((skill) => groupOf(skill) === group) })).filter(
    (entry) => entry.skills.length > 0,
  );

/**
 * The line that the menu shows in place of its options while it offers none: that the skills are being read, why they
 * cannot be read, that the session lists none, or that none matches the text `text`.
 */
const NoMatch = ({ text, skills, failure }: Pick<SkillMenuProps, 'text' | 'skills' | 'failure'>) => {
  if (skills === undefined) {
    return failure === null ? (
      <p className="text-muted-foreground">Reading the skills of this session…</p>
    ) : (
      <p className="text-destructive">{`The skills cannot be read: ${failure}`}</p>
    );
  }
  return skills.length === 0 ? (
    <p className="text-muted-foreground">This session lists no skills yet.</p>
  ) : (
    <p className="text-muted-foreground">
      No skill matches <span className="font-mono text-foreground">{text}</span>. Enter sends the text as a message.
    </p>
  );
};

/**
 * One option of the menu: the slash and the command of `skill`, then the first line of its description, cut to the
 * width of the menu. The command of a main skill is set heavier and its row looser than those of a helper skill. It takes the
 * columns of the grid of its listbox.
 */
const SkillOption = ({
  id,
  skill,
  highlighted,
  onHighlight,
  onPick,
}: {
  id: string;
  skill: Skill;
  highlighted: boolean;
  onHighlight: () => void;
  onPick: () => void;
}) => {
  const command = commandOf(skill);
  const main = groupOf(skill) === 'main';
  return (
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={highlighted}
      aria-label={`/${command}`}
      onMouseMove={onHighlight}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      className={cn(
        'col-span-full grid cursor-default select-none grid-cols-subgrid items-baseline rounded-lg pr-3 pl-2',
        main ? 'py-1.5' : 'py-1',
        highlighted && 'bg-accent text-accent-foreground',
      )}
    >
      <span className="pr-5 font-mono text-[0.8125rem]">
        <span className="text-muted-foreground">/</span>
        <span className={main ? 'font-semibold' : undefined}>{command}</span>
      </span>
      <span className="truncate text-muted-foreground text-xs">{skill.description.split('\n')[0]}</span>
    </div>
  );
};

/**
 * One group of the menu: its heading, which stays at the top of the list while the options of the group scroll under
 * it, then its options `children`. A line parts it from the group above it. It takes the columns of the grid of its
 * listbox.
 */
const OptionGroup = ({ id, heading, children }: { id: string; heading: string; children: ReactNode }) => (
  <div
    role="group"
    aria-labelledby={id}
    className="col-span-full grid grid-cols-subgrid not-first:mt-1 not-first:border-t not-first:pt-1"
  >
    <div
      id={id}
      role="presentation"
      className="sticky -top-1.5 z-10 col-span-full bg-popover px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs"
    >
      {heading}
    </div>
    {children}
  </div>
);

/**
 * The menu of the skills of a session, which floats above its text box. Its container must be positioned, such as
 * with the class `relative`. The options come in groups under a heading, the main skills first and the helper skills
 * after them, and a group that holds no match is left out. Each option shows the command of a skill in one column and
 * its description in the next, so that the eye runs down the commands. While no skill matches, a line says why. The
 * highlighted option scrolls into view below the heading of its group. A mouse press picks an option and leaves the focus where it is, and the pointer
 * highlights the option under it.
 */
export const SkillMenu = ({ id, text, skills, failure, matches, active, onHighlight, onPick }: SkillMenuProps) => {
  const highlighted = matches[active];
  const highlightedId = highlighted === undefined ? undefined : skillOptionId(id, highlighted);

  useEffect(() => {
    if (highlightedId !== undefined) {
      document.getElementById(highlightedId)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedId]);

  return (
    <div className="motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 absolute inset-x-0 bottom-full z-50 mb-2 flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:duration-150">
      <div
        id={id}
        role="listbox"
        aria-label="Skills"
        className="grid max-h-72 scroll-pt-8 grid-cols-[max-content_minmax(0,1fr)] content-start overflow-y-auto overscroll-contain p-1.5 empty:p-0"
      >
        {groupsOf(matches).map(({ group, skills: groupSkills }) => (
          <OptionGroup key={group} id={`${id}-${group}`} heading={GROUP_HEADINGS[group]}>
            {groupSkills.map((skill) => {
              const index = matches.indexOf(skill);
              return (
                <SkillOption
                  key={skill.name}
                  id={skillOptionId(id, skill)}
                  skill={skill}
                  highlighted={index === active}
                  onHighlight={() => onHighlight(index)}
                  onPick={() => onPick(skill)}
                />
              );
            })}
          </OptionGroup>
        ))}
      </div>
      {highlighted === undefined && (
        <div role="status" className="px-4 py-3 text-sm">
          <NoMatch text={text} skills={skills} failure={failure} />
        </div>
      )}
    </div>
  );
};
