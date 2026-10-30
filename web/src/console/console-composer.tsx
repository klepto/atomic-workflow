import { ArrowUp } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import type { Skill } from '@/api/types.ts';
import { commandOf, skillOf } from '@/commands/skill-commands.ts';
import { SkillMenu } from '@/commands/skill-menu.tsx';
import { useSkillMenu } from '@/commands/use-skill-menu.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

/**
 * Props of `ConsoleComposer`.
 */
interface ConsoleComposerProps {
  /**
   * Text that the empty box shows, which names who receives a message.
   */
  readonly placeholder: string;

  /**
   * What the user should know before sending, such as that the server is not reachable now, or `null` when nothing.
   * It never keeps a text from being sent.
   */
  readonly notice: string | null;

  /**
   * Skills that the session of the chat can run, or `undefined` while they are not known yet.
   */
  readonly skills: readonly Skill[] | undefined;

  /**
   * Message of the latest failed read of the skills, or `null` when none failed.
   */
  readonly skillsFailure: string | null;

  /**
   * Where a skill that the composer sends runs, such as `a new subagent`.
   */
  readonly runsIn: ReactNode;

  /**
   * Called each time the menu of the skills opens, so that the skills can be read again.
   */
  readonly onMenuOpen: () => void;

  /**
   * Takes the text `text` as the user typed it.
   */
  readonly onSend: (text: string) => void;
}

/**
 * Returns the line below the box: `notice` when it is not `null`, else that the skill `skill` would run in `runsIn`,
 * else, while `skill` is `undefined`, the keys of the box.
 */
const hintOf = (notice: string | null, skill: Skill | undefined, runsIn: ReactNode): ReactNode => {
  if (notice !== null) {
    return notice;
  }
  return skill === undefined ? (
    'Enter sends, Shift+Enter starts a new line, / lists the skills.'
  ) : (
    <>
      Enter runs <span className="font-mono text-foreground">/{commandOf(skill)}</span> in {runsIn}.
    </>
  );
};

/**
 * Composer of the console: a text box that grows with its text up to a limit, and a button that hands the text
 * over as it is. Enter sends, and Shift+Enter starts a new line. The box is emptied and keeps the focus after a send.
 * A slash opens the menu of the skills of the session, and a picked skill puts its command into the box. While the text
 * runs a skill, the line below the box says where it runs. While `notice` is not `null`, the composer shows it below
 * the box, and still sends.
 */
export const ConsoleComposer = ({
  placeholder,
  notice,
  skills,
  skillsFailure,
  runsIn,
  onMenuOpen,
  onSend,
}: ConsoleComposerProps) => {
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const sendable = text.trim() !== '';
  const menu = useSkillMenu({ text, setText, field, skills, onOpen: onMenuOpen });
  const skill = skillOf(text, skills ?? []);

  /**
   * Hands the text over as it is, empties the box, and gives the focus back to the box.
   */
  const send = (): void => {
    if (!sendable) {
      return;
    }
    onSend(text);
    setText('');
    field.current?.focus();
  };

  /**
   * Lets the open menu use the key of `event` first. Otherwise sends the text on Enter without Shift. Enter while an
   * input method composes a character is left to it.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (menu.handleKeyDown(event)) {
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    send();
  };

  return (
    <form
      aria-label="Composer"
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="relative">
        {menu.open && (
          <SkillMenu
            id={menu.menuId}
            text={text}
            skills={skills}
            failure={skillsFailure}
            matches={menu.matches}
            active={menu.active}
            onHighlight={menu.highlight}
            onPick={menu.pick}
          />
        )}
        <div className="flex flex-col gap-1 rounded-2xl border border-input bg-card p-2 pl-4 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <div className="flex items-end gap-2">
            <Textarea
              ref={field}
              aria-label="Message"
              rows={1}
              placeholder={placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              {...menu.fieldProps}
              className="max-h-60 min-h-9 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-1.5 font-mono text-sm leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm"
            />
            <Hint description="Send the message" note={sendable ? undefined : 'Write a message first'}>
              <Button type="submit" size="icon" aria-label="Send" disabled={!sendable} className="rounded-xl">
                <ArrowUp />
              </Button>
            </Hint>
          </div>
        </div>
      </div>
      <div className="flex justify-between gap-2 px-2 text-muted-foreground text-xs">
        <p>{hintOf(notice, skill, runsIn)}</p>
      </div>
    </form>
  );
};
