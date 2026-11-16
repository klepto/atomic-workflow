import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { anchorWords, type CommentAnchor } from '@/review/comment-anchor.ts';
import { CommentComposer } from '@/review/comment-composer.tsx';
import type { FileReview, ThreadActions } from '@/review/file-review.ts';
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
 * Props of `CommentThreadView`.
 */
interface CommentThreadViewProps {
  /**
   * Comments of the thread, in the order they were added.
   */
  readonly comments: readonly ReviewComment[];

  /**
   * Selection to write a new comment on, or `undefined` while the thread holds none.
   */
  readonly selection: CommentAnchor | undefined;

  /**
   * Identifier of the comment that the user edits, or `undefined` while they edit none.
   */
  readonly editing: string | undefined;

  /**
   * Functions that change the comments.
   */
  readonly actions: ThreadActions;
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
 * Thread of the comments `comments`, with the field for a new comment on `selection` when it is not `undefined`, or
 * nothing when there is neither. The comment `editing` shows as a field that edits it. The thread hangs below the lines
 * it points at, with a bar of the primary color at its left that joins it to the bar beside those lines.
 */
export const CommentThreadView = ({ comments, selection, editing, actions }: CommentThreadViewProps) => {
  if (comments.length === 0 && selection === undefined) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-l-4 border-l-primary bg-muted/40 px-3 py-3">
      {comments.map((comment) =>
        comment.id === editing ? (
          <CommentComposer
            key={comment.id}
            label={`Edit the comment on ${anchorWords(comment.anchor)}`}
            initial={comment.body}
            submitLabel="Save"
            submitDescription="Save the changes to the comment"
            onSubmit={(body) => actions.onSave(comment.id, body)}
            onCancel={actions.onCancel}
          />
        ) : (
          <CommentCard
            key={comment.id}
            comment={comment}
            onEdit={() => actions.onEdit(comment.id)}
            onDelete={() => actions.onDelete(comment.id)}
          />
        ),
      )}
      {selection !== undefined && (
        <CommentComposer
          label={`Comment on ${anchorWords(selection)}`}
          submitLabel="Add comment"
          submitDescription="Add the comment to the review"
          onSubmit={actions.onAdd}
          onCancel={actions.onCancel}
        />
      )}
    </div>
  );
};

/**
 * Thread of the comments of `review` whose anchor `matches` accepts, with the field for a new comment when the
 * selection is such an anchor, or nothing when there is neither, as `CommentThreadView` shows them.
 */
export const CommentThread = ({ review, matches }: CommentThreadProps) => (
  <CommentThreadView
    comments={review.comments.filter((comment) => matches(comment.anchor))}
    selection={review.selection !== undefined && matches(review.selection) ? review.selection : undefined}
    editing={review.editing}
    actions={review}
  />
);
