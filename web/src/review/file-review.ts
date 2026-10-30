import type { CommentAnchor } from '@/review/comment-anchor.ts';
import type { DiffSide } from '@/review/patch.ts';
import type { ReviewComment } from '@/review/review-draft.ts';

/**
 * Comments of the review on one file, with what the user selected in it, and the functions that change them.
 */
export interface FileReview {
  /**
   * Comments on the file, in the order they were added.
   */
  readonly comments: readonly ReviewComment[];

  /**
   * What the user selected in the file to comment on, or `undefined` while they selected nothing in it.
   */
  readonly selection: CommentAnchor | undefined;

  /**
   * Identifier of the comment of the file that the user edits, or `undefined` while they edit none.
   */
  readonly editing: string | undefined;

  /**
   * Selects the line `number` of the side `side` to comment on, or extends the selection to it with `extend`.
   */
  readonly onSelectLine: (side: DiffSide, number: number, extend: boolean) => void;

  /**
   * Selects the whole file to comment on.
   */
  readonly onSelectFile: () => void;

  /**
   * Adds a comment with the text `body` on the selection, and clears the selection.
   */
  readonly onAdd: (body: string) => void;

  /**
   * Clears the selection, and ends the edit of a comment without a change.
   */
  readonly onCancel: () => void;

  /**
   * Starts the edit of the comment `id`.
   */
  readonly onEdit: (id: string) => void;

  /**
   * Replaces the text of the comment `id` with `body`, and ends its edit.
   */
  readonly onSave: (id: string, body: string) => void;

  /**
   * Deletes the comment `id`.
   */
  readonly onDelete: (id: string) => void;
}
