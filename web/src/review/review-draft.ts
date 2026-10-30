import type { CommentAnchor } from '@/review/comment-anchor.ts';

/**
 * Comment of a review on a file of the changes.
 */
export interface ReviewComment {
  /**
   * Identifier of the comment, unique in its review.
   */
  readonly id: string;

  /**
   * Path that names the file, `FileDiff.path`.
   */
  readonly path: string;

  /**
   * What the comment points at in the file.
   */
  readonly anchor: CommentAnchor;

  /**
   * Text of the comment, in Markdown.
   */
  readonly body: string;
}

/**
 * Review of a ticket that the user writes before they send it: their comments on the files, and their overall
 * comment.
 */
export interface ReviewDraft {
  /**
   * Comments on the files, in the order they were added.
   */
  readonly comments: readonly ReviewComment[];

  /**
   * Overall comment on the changes, or an empty string for none.
   */
  readonly overall: string;
}

/**
 * Review with no comment.
 */
export const EMPTY_DRAFT: ReviewDraft = { comments: [], overall: '' };

/**
 * Returns whether the review `draft` holds no comment and no overall comment.
 */
export const isEmptyDraft = (draft: ReviewDraft): boolean => draft.comments.length === 0 && draft.overall.trim() === '';

/**
 * Returns the number of the comments of the review `draft`, with its overall comment as one more.
 */
export const commentCountOf = (draft: ReviewDraft): number =>
  draft.comments.length + (draft.overall.trim() === '' ? 0 : 1);
