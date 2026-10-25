import { type ReactNode, useEffect } from 'react';
import type { Skill } from '@/api/types.ts';
import { cn } from '@/lib/utils.ts';
import { commandOf } from './skill-commands.ts';
import { skillOptionId } from './use-skill-menu.ts';

/**
 * Props of the skill menu.
 */
export interface SkillMenuProps {
  /**
   * The id of the listbox. The id of each option is this id, a hyphen and the name of its skill.
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
   * The skills to offer, the best match first.
   */
  matches: readonly Skill[];

  /**
   * The index of the highlighted skill in `matches`.
   */
  active: number;

  /**
   * Where a picked skill runs, such as `a new subagent`, which the foot of the menu names.
   */
  runsIn: ReactNode;

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
 * One option of the menu: the slash and the command of `skill`, then the first line of its description on a screen
 * wide enough. It takes the columns of the grid of its listbox.
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
        'col-span-full grid cursor-default select-none grid-cols-subgrid items-baseline rounded-lg py-1.5 pr-3 pl-2',
        highlighted && 'bg-accent text-accent-foreground',
      )}
    >
      <span className="pr-5 font-mono text-[0.8125rem]">
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{command}</span>
      </span>
      <span className="hidden truncate text-muted-foreground text-xs sm:block">{skill.description.split('\n')[0]}</span>
    </div>
  );
};

/**
 * The foot of the menu: the whole description of the highlighted skill `skill`, then where it runs and the keys of
 * the menu.
 */
const SkillDetail = ({ skill, runsIn }: { skill: Skill; runsIn: ReactNode }) => (
  <div className="flex flex-col gap-2 border-t bg-muted/40 px-4 py-3">
    <p className="line-clamp-3 whitespace-pre-line text-sm leading-5">{skill.description}</p>
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-muted-foreground text-xs">
      <p>Runs in {runsIn}.</p>
      <p>Tab or Enter picks, Esc closes.</p>
    </div>
  </div>
);

/**
 * The menu of the skills of a session, which floats above its text box. Its container must be positioned, such as
 * with the class `relative`. Each option shows the command of a skill in one column and its description in the next,
 * so that the eye runs down the commands. The foot shows the whole description of the highlighted skill, and where it
 * runs. While no skill matches, a line says why. The highlighted
 * option scrolls into view. A mouse press picks an option and leaves the focus where it is, and the pointer
 * highlights the option under it.
 */
export const SkillMenu = ({
  id,
  text,
  skills,
  failure,
  matches,
  active,
  runsIn,
  onHighlight,
  onPick,
}: SkillMenuProps) => {
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
        className="grid max-h-64 grid-cols-[max-content_minmax(0,1fr)] content-start overflow-y-auto overscroll-contain p-1.5 empty:p-0"
      >
        {matches.map((skill, index) => (
          <SkillOption
            key={skill.name}
            id={skillOptionId(id, skill)}
            skill={skill}
            highlighted={index === active}
            onHighlight={() => onHighlight(index)}
            onPick={() => onPick(skill)}
          />
        ))}
      </div>
      {highlighted === undefined ? (
        <div role="status" className="px-4 py-3 text-sm">
          <NoMatch text={text} skills={skills} failure={failure} />
        </div>
      ) : (
        <SkillDetail skill={highlighted} runsIn={runsIn} />
      )}
    </div>
  );
};
