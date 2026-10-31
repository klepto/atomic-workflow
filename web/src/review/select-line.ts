import type { CommentAnchor } from '@/review/comment-anchor.ts';
import type { DiffSide } from '@/review/patch.ts';

/**
 * What the user selected to comment on: the anchor in the file `path`, and the line `origin` that a shift and a click
 * extend the selection from, or `null` for a selection of the whole file.
 */
export interface Selection {
  /**
   * Path that names the file of the selection.
   */
  readonly path: string;

  /**
   * What the selection covers in the file.
   */
  readonly anchor: CommentAnchor;

  /**
   * Line that the selection started at, or `null` for the whole file.
   */
  readonly origin: number | null;
}

/**
 * Returns the next selection once the user selected the line `number` of the side `side` in the file `path`, from the
 * selection `current`. With `extend`, a selection of lines of the same side of the same file grows to the line, from
 * the line it started at. Otherwise the line alone is selected.
 */
export const selectLine = (
  current: Selection | undefined,
  path: string,
  side: DiffSide,
  number: number,
  extend: boolean,
): Selection => {
  if (extend && current?.path === path && current.anchor.kind === 'lines' && current.anchor.side === side) {
    const from = current.origin ?? number;
    return { ...current, anchor: { ...current.anchor, start: Math.min(from, number), end: Math.max(from, number) } };
  }
  return { path, origin: number, anchor: { kind: 'lines', side, start: number, end: number } };
};
