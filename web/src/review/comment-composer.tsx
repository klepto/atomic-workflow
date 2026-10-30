import { type KeyboardEvent, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

/**
 * Props of `CommentComposer`.
 */
interface CommentComposerProps {
  /**
   * Accessible name of the field.
   */
  readonly label: string;

  /**
   * Text that the field starts with, empty by default.
   */
  readonly initial?: string;

  /**
   * Label of the button that submits the comment.
   */
  readonly submitLabel: string;

  /**
   * Hint of the button that submits the comment.
   */
  readonly submitDescription: string;

  /**
   * Receives the trimmed text of the comment once the user submits it.
   */
  readonly onSubmit: (body: string) => void;

  /**
   * Closes the field without a change.
   */
  readonly onCancel: () => void;
}

/**
 * Field for the text of a comment, with its buttons: `Cancel`, and `submitLabel`, which hands the trimmed text to
 * `onSubmit` once it is not empty, with `submitDescription` as its hint. Ctrl+Enter, or Cmd+Enter, submits too, and
 * Escape cancels. It takes the focus when it opens, and starts with the text `initial`.
 */
export const CommentComposer = ({
  label,
  initial = '',
  submitLabel,
  submitDescription,
  onSubmit,
  onCancel,
}: CommentComposerProps) => {
  const [text, setText] = useState(initial);
  const empty = text.trim() === '';

  /**
   * Hands the text to `onSubmit` unless it is empty.
   */
  const submit = (): void => {
    if (!empty) onSubmit(text.trim());
  };

  /**
   * Submits on Ctrl+Enter or Cmd+Enter, and cancels on Escape.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        // The field opens on a click that asks to write a comment.
        autoFocus
        aria-label={label}
        placeholder="Write a comment"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-20 bg-background font-sans"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-muted-foreground text-xs sm:inline">Ctrl+Enter to save</span>
        <Hint description="Close the field without saving the comment">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </Hint>
        <Hint description={submitDescription} note={empty ? 'Write a comment first' : undefined}>
          <Button type="submit" size="sm" disabled={empty}>
            {submitLabel}
          </Button>
        </Hint>
      </div>
    </form>
  );
};
