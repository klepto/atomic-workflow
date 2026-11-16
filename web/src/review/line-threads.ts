import { endsAt } from '@/review/comment-anchor.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { DiffSide } from '@/review/patch.ts';
import type { ReviewComment } from '@/review/review-draft.ts';

/**
 * Thread below a line: the comments that end at the line, with the selection and the edit among them.
 */
export interface LineThread {
  /**
   * Comments that end at the line, in the order they were added.
   */
  readonly comments: readonly ReviewComment[];

  /**
   * Selection of the review when it ends at the line, or `undefined` otherwise.
   */
  readonly selection: FileReview['selection'];

  /**
   * Identifier of the comment that the user edits when it is one of `comments`, or `undefined` otherwise.
   */
  readonly editing: string | undefined;
}

/**
 * Returns the thread below the line with the old number `oldNumber` and the new number `newNumber`, each `null`
 * when the line has no number on that side.
 */
export type ThreadFinder = (oldNumber: number | null, newNumber: number | null) => LineThread;

/**
 * List with no comment, the same for every line without one, so that a row that compares its props keeps it.
 */
const NO_COMMENTS: readonly ReviewComment[] = [];

/**
 * Returns the key of the line `number` of the side `side`.
 */
const endKey = (side: DiffSide, number: number): string => `${side}:${number}`;

/**
 * Returns the finder of the threads of the lines of the file of `review`. It sorts the comments by the line they end
 * at once, so that each line finds its thread without a look at every comment.
 */
export const threadFinderOf = (review: Pick<FileReview, 'comments' | 'selection' | 'editing'>): ThreadFinder => {
  const byEnd = new Map<string, ReviewComment[]>();
  for (const comment of review.comments) {
    if (comment.anchor.kind !== 'lines') continue;
    const key = endKey(comment.anchor.side, comment.anchor.end);
    const known = byEnd.get(key);
    if (known === undefined) byEnd.set(key, [comment]);
    else known.push(comment);
  }

  /**
   * Returns the comments that end at the old line `oldNumber` or at the new line `newNumber`, in the order they were
   * added.
   */
  const commentsAt = (oldNumber: number | null, newNumber: number | null): readonly ReviewComment[] => {
    const old = oldNumber === null ? undefined : byEnd.get(endKey('old', oldNumber));
    const added = newNumber === null ? undefined : byEnd.get(endKey('new', newNumber));
    if (old === undefined) return added ?? NO_COMMENTS;
    if (added === undefined) return old;
    // Comments that end on both sides of one line are rare, so the order comes from the whole list only then.
    return review.comments.filter((comment) => endsAt(comment.anchor, oldNumber, newNumber));
  };

  return (oldNumber, newNumber) => {
    const comments = commentsAt(oldNumber, newNumber);
    const { selection, editing } = review;
    return {
      comments,
      selection: selection !== undefined && endsAt(selection, oldNumber, newNumber) ? selection : undefined,
      editing: editing !== undefined && comments.some((comment) => comment.id === editing) ? editing : undefined,
    };
  };
};
