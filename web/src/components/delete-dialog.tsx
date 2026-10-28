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

/**
 * Props of the delete dialog.
 */
export interface DeleteDialogProps {
  /**
   * The button that opens the dialog, without its content.
   */
  trigger: ReactElement;

  /**
   * The content of the button that opens the dialog, such as its icon.
   */
  children: ReactNode;

  /**
   * The title of the dialog, which asks whether to delete.
   */
  title: string;

  /**
   * What the deletion deletes, and that it cannot be undone.
   */
  description: ReactNode;

  /**
   * The words of the button that deletes, such as `Delete task`.
   */
  confirm: string;

  /**
   * What the dialog offers after a failure, the words of its button and a note on what the retry loses, or
   * `undefined` to offer the same deletion again.
   */
  retry?: { confirm: string; note: string };

  /**
   * Deletes, again after a failure while `retried` is true. Rejects with the failure, whose message the dialog shows.
   */
  onDelete: (retried: boolean) => Promise<void>;
}

/**
 * The button `trigger` that deletes something for good, which asks first in a dialog above the whole window, dimmed,
 * with the title `title`, the description `description`, and the buttons `Cancel` and `confirm`. Until the deletion
 * ends, the buttons show `Deleting…` and are disabled, and the dialog stays open. A failure shows its message in the
 * dialog, with the retry `retry` while it is set. Once the deletion succeeds, the dialog closes.
 */
export const DeleteDialog = ({
  trigger,
  children,
  title,
  description,
  confirm,
  retry,
  onDelete,
}: DeleteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const retrying = error !== undefined && retry !== undefined;

  /**
   * Opens or closes the dialog, which stays open while the deletion runs. Each opening clears the last failure.
   */
  const changeOpen = (next: boolean) => {
    if (pending) {
      return;
    }
    setOpen(next);
    if (next) {
      setError(undefined);
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger render={trigger}>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {error !== undefined && (
          <div role="alert" className="flex flex-col gap-1 text-sm">
            <p className="text-destructive">{error}</p>
            {retry !== undefined && <p className="text-muted-foreground">{retry.note}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <AlertDialogClose disabled={pending} render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" disabled={pending} onClick={remove}>
            {pending ? 'Deleting…' : retrying ? retry.confirm : confirm}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
