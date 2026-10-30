import { type ReactElement, type ReactNode, useState } from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { errorMessage } from '@/lib/error-message.ts';

/**
 * Retry that the delete dialog offers after a failure.
 */
interface DeleteRetry {
  /**
   * Words of the button that deletes again, such as `Delete anyway`.
   */
  readonly confirm: string;

  /**
   * Note on what the retry loses, below the message of the failure.
   */
  readonly note: string;
}

/**
 * Props of `DeleteDialog`.
 */
interface DeleteDialogProps {
  /**
   * Button that opens the dialog, without its content.
   */
  readonly trigger: ReactElement;

  /**
   * Content of the button that opens the dialog, such as its icon.
   */
  readonly children: ReactNode;

  /**
   * What the deletion deletes, as the description of the hint of the button that opens the dialog and of the button
   * that deletes, such as `Delete the task with its plan, branches and chats`.
   */
  readonly hint: string;

  /**
   * Title of the dialog, which asks whether to delete.
   */
  readonly title: string;

  /**
   * What the deletion deletes, and that it cannot be undone.
   */
  readonly description: ReactNode;

  /**
   * Words of the button that deletes, such as `Delete task`.
   */
  readonly confirm: string;

  /**
   * Retry that the dialog offers after a failure, or `undefined` to offer the same deletion again.
   */
  readonly retry?: DeleteRetry;

  /**
   * Deletes, again after a failure while `retried` is true. Rejects with the failure, whose message the dialog shows.
   */
  readonly onDelete: (retried: boolean) => Promise<void>;
}

/**
 * Button `trigger` that deletes something for good, which asks first in a dialog above the whole window, dimmed, with
 * the title `title`, the description `description`, and the buttons `Cancel` and `confirm`. Until the deletion ends,
 * the buttons show `Deleting…` and are disabled, and the dialog stays open. A failure shows its message in the dialog,
 * with the retry `retry` while it is set. Once the deletion succeeds, the dialog closes. The button `trigger` and the
 * button that deletes show `hint` in their hints, and the buttons of the dialog say in their hints why they are
 * disabled while the deletion runs.
 */
export const DeleteDialog = ({
  trigger,
  children,
  hint,
  title,
  description,
  confirm,
  retry,
  onDelete,
}: DeleteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  const retrying = failure !== undefined && retry !== undefined;
  const pendingNote = pending ? 'The deletion is running' : undefined;

  /**
   * Opens or closes the dialog, which stays open while the deletion runs. Each opening clears the last failure.
   */
  const changeOpen = (next: boolean) => {
    if (pending) {
      return;
    }
    setOpen(next);
    if (next) {
      setFailure(undefined);
    }
  };

  /**
   * Deletes, as a retry after a failure, and closes the dialog once it is deleted.
   */
  const remove = async () => {
    setPending(true);
    try {
      await onDelete(retrying);
      setOpen(false);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <Hint description={hint}>
        <AlertDialogTrigger render={trigger}>{children}</AlertDialogTrigger>
      </Hint>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {failure !== undefined && (
          <div role="alert" className="flex flex-col gap-1 text-sm">
            <p className="text-destructive">{failure}</p>
            {retry !== undefined && <p className="text-muted-foreground">{retry.note}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Hint description="Close the dialog and delete nothing" note={pendingNote}>
            <AlertDialogClose disabled={pending} render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
          </Hint>
          <Hint description={hint} note={pendingNote}>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? 'Deleting…' : retrying ? retry.confirm : confirm}
            </Button>
          </Hint>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
