import type { Changes } from '@/review/use-changes.ts';

/**
 * Props of `ChangesNotice`.
 */
interface ChangesNoticeProps {
  /**
   * Changes of the ticket as the review read them.
   */
  readonly changes: Changes;

  /**
   * Whether the work of the ticket landed.
   */
  readonly landed: boolean;
}

/**
 * Line where the changes of the ticket stand while they cannot show: while its work has not landed, while they load,
 * once the read failed, or once no commit holds them.
 */
export const ChangesNotice = ({ changes, landed }: ChangesNoticeProps) => {
  if (!landed) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
        The work of this ticket has not landed yet. Its review opens once it needs review.
      </p>
    );
  }
  if (changes.state === 'loading') return <p className="text-muted-foreground text-sm">Reading the changes</p>;
  if (changes.state === 'failed') {
    return (
      <p role="alert" className="text-destructive text-sm">
        {`The changes cannot be read: ${changes.message}`}
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
      No commit holds the work of this ticket. It changed nothing, or it landed before commits named their ticket. You
      can still leave an overall comment.
    </p>
  );
};
