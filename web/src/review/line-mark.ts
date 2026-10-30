import { coversLine } from '@/review/comment-anchor.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { DiffLine } from '@/review/patch.ts';

/**
 * How a line stands among the comments of the review: `selected` while the selection covers it, `commented` while a
 * comment covers it, and `plain` otherwise.
 */
export type LineMark = 'selected' | 'commented' | 'plain';

/**
 * Returns how the line `line` stands among the comments of `review`.
 */
export const markOf = (line: DiffLine, review: FileReview): LineMark => {
  if (review.selection !== undefined && coversLine(review.selection, line)) return 'selected';
  return review.comments.some((comment) => coversLine(comment.anchor, line)) ? 'commented' : 'plain';
};

/**
 * Returns the classes of the background of the code of the line `line` with the mark `mark`, by what the change did
 * to it, or by the selection.
 */
export const codeTint = (line: DiffLine, mark: LineMark): string => {
  if (mark === 'selected') return 'bg-primary/12';
  if (line.kind === 'add') return 'bg-diff-add/12';
  return line.kind === 'delete' ? 'bg-diff-delete/12' : '';
};

/**
 * Returns the classes of the background of the number of the line `line` with the mark `mark`, by what the change did
 * to it, or by the selection.
 */
export const numberTint = (line: DiffLine, mark: LineMark): string => {
  if (mark === 'selected') return 'bg-primary/20 text-foreground';
  if (line.kind === 'add') return 'bg-diff-add/20';
  return line.kind === 'delete' ? 'bg-diff-delete/20' : '';
};
