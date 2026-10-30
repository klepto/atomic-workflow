import type { DiffLine, DiffSide } from '@/review/patch.ts';

/**
 * What a comment of a review points at: a whole file, such as a file that was only moved, or a run of lines of one
 * side of a file, from `start` to `end`, both included.
 */
export type CommentAnchor =
  | { readonly kind: 'file' }
  | { readonly kind: 'lines'; readonly side: DiffSide; readonly start: number; readonly end: number };

/**
 * Returns whether the anchor `anchor` covers the number `number` of the side `side`.
 */
const covers = (anchor: CommentAnchor, side: DiffSide, number: number | null): boolean =>
  anchor.kind === 'lines' && number !== null && anchor.side === side && number >= anchor.start && number <= anchor.end;

/**
 * Returns whether the anchor `anchor` covers the line `line` on either of its sides.
 */
export const coversLine = (anchor: CommentAnchor, line: DiffLine): boolean =>
  covers(anchor, 'old', line.oldNumber) || covers(anchor, 'new', line.newNumber);

/**
 * Returns whether the anchor `anchor` is a run of lines that ends at the old line `oldNumber` or at the new line
 * `newNumber`.
 */
export const endsAt = (anchor: CommentAnchor, oldNumber: number | null, newNumber: number | null): boolean =>
  anchor.kind === 'lines' && anchor.end === (anchor.side === 'old' ? oldNumber : newNumber);

/**
 * Returns the words that name the lines of the anchor `anchor`, such as `line 4` or `lines 4 to 9`, with `(old)` for
 * the lines before the change, or `the whole file` for a file anchor.
 */
export const anchorWords = (anchor: CommentAnchor): string => {
  if (anchor.kind === 'file') return 'the whole file';
  const lines = anchor.start === anchor.end ? `line ${anchor.start}` : `lines ${anchor.start} to ${anchor.end}`;
  return anchor.side === 'old' ? `${lines} (old)` : lines;
};
