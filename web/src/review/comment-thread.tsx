import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { anchorWords, type CommentAnchor } from '@/review/comment-anchor.ts';
import { CommentComposer } from '@/review/comment-composer.tsx';
import type { FileReview } from '@/review/file-review.ts';
import type { ReviewComment } from '@/review/review-draft.ts';

/**
 * Props of `CommentCard`.
 */
interface CommentCardProps {
  /**
   * Comment to show.
   */
  readonly comment: ReviewComment;

  /**
   * Starts the edit of the comment.
   */
  readonly onEdit: () => void;

  /**
   * Deletes the comment.
   */
  readonly onDelete: () => void;
}

/**
 * Props of `CommentThread`.
 */
interface CommentThreadProps {
  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;

  /**
   * Returns whether the thread holds the comment or the selection with the anchor `anchor`.
   */
  readonly matches: (anchor: CommentAnchor) => boolean;
}

/**
 * Comment of the review: its text, with the buttons that edit and delete it.
 */
const CommentCard = ({ comment, onEdit, onDelete }: CommentCardProps) => (
  <article
    aria-label={`Comment on ${anchorWords(comment.anchor)}`}
    className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 font-sans"
  >
    <MarkdownBody text={comment.body} className="min-w-0 flex-1 leading-6" />
    <div className="-mr-1.5 flex shrink-0 gap-0.5">
      <Hint description="Edit the comment">
        <Button variant="ghost" size="icon" className="size-7" aria-label="Edit comment" onClick={onEdit}>
          <Pencil aria-hidden="true" className="size-3.5" />
        </Button>
      </Hint>
      <Hint description="Delete the comment">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete comment"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </Button>
      </Hint>
    </div>
  </article>
);

/**
 * Thread of the comments of `review` whose anchor `matches` accepts, with the field for a new comment when the
 * selection is such an anchor, or nothing when there is neither. The thread hangs below the lines it points at, with a
 * bar of the primary color at its left that joins it to the bar beside those lines.
 */
export const CommentThread = ({ review, matches }: CommentThreadProps) => {
  const comments = review.comments.filter((comment) => matches(comment.anchor));
  const selection = review.selection !== undefined && matches(review.selection) ? review.selection : undefined;
  if (comments.length === 0 && selection === undefined) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-l-4 border-l-primary bg-muted/40 px-3 py-3">
      {comments.map((comment) =>
        comment.id === review.editing ? (
          <CommentComposer
            key={comment.id}
            label={`Edit the comment on ${anchorWords(comment.anchor)}`}
            initial={comment.body}
            submitLabel="Save"
            submitDescription="Save the changes to the comment"
            onSubmit={(body) => review.onSave(comment.id, body)}
            onCancel={review.onCancel}
          />
        ) : (
          <CommentCard
            key={comment.id}
            comment={comment}
            onEdit={() => review.onEdit(comment.id)}
            onDelete={() => review.onDelete(comment.id)}
          />
        ),
      )}
      {selection !== undefined && (
        <CommentComposer
          label={`Comment on ${anchorWords(selection)}`}
          submitLabel="Add comment"
          submitDescription="Add the comment to the review"
          onSubmit={review.onAdd}
          onCancel={review.onCancel}
        />
      )}
    </div>
  );
};
