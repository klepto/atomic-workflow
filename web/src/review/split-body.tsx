import { Fragment } from 'react';
import { cn } from '@/lib/utils.ts';
import { endsAt } from '@/review/comment-anchor.ts';
import { CommentThread } from '@/review/comment-thread.tsx';
import type { SplitPiece } from '@/review/diff-chunks.ts';
import type { FileReview } from '@/review/file-review.ts';
import { CodeCell, HunkHeader, LineButton, Rail } from '@/review/line-cells.tsx';
import { codeTint, markOf, numberTint } from '@/review/line-mark.ts';
import { type DiffLine, type DiffSide, numberOn } from '@/review/patch.ts';
import type { FileHighlight } from '@/review/use-file-highlight.ts';

/**
 * Props of `SplitHalf`.
 */
interface SplitHalfProps {
  /**
   * Line of the side in the row, or `null` for none.
   */
  readonly line: DiffLine | null;

  /**
   * Side of the half.
   */
  readonly side: DiffSide;

  /**
   * Colors of the lines of the file, or `undefined` while they load.
   */
  readonly highlight: FileHighlight | undefined;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Props of `SplitBody`.
 */
interface SplitBodyProps {
  /**
   * Runs of the rows of the hunks of the file to show.
   */
  readonly pieces: readonly SplitPiece[];

  /**
   * Colors of the lines of the file, or `undefined` while they load.
   */
  readonly highlight: FileHighlight | undefined;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Columns of a row of the split view: for each side, the bar, the number of the line, and its code.
 */
const SPLIT_COLUMNS = 'grid-cols-[4px_3rem_minmax(0,1fr)_4px_3rem_minmax(0,1fr)]';

/**
 * One side of a row of the split view: the line `line` of the side `side` with its bar, its number and its code in the
 * colors of `highlight`, or an empty space when the side has no line in the row.
 */
const SplitHalf = ({ line, side, highlight, review }: SplitHalfProps) => {
  const number = line === null ? null : numberOn(line, side);
  if (line === null || number === null) {
    return <span aria-hidden="true" className="col-span-3 bg-muted/50" />;
  }
  const mark = markOf(line, review);
  return (
    <>
      <Rail mark={mark} />
      <LineButton
        side={side}
        number={number}
        oldNumber={side === 'old' ? number : undefined}
        newNumber={side === 'new' ? number : undefined}
        className={numberTint(line, mark)}
        onSelect={review.onSelectLine}
      />
      <CodeCell line={line} highlight={highlight} className={cn(codeTint(line, mark), side === 'old' && 'border-r')} />
    </>
  );
};

/**
 * Runs `pieces` of the hunks of a file in two columns, each with the header of its hunk when it starts the hunk, the old
 * lines at the left and the new ones at the right, each with its code in the colors of `highlight`, and the threads of
 * the comments of `review` below the rows they end at.
 */
export const SplitBody = ({ pieces, highlight, review }: SplitBodyProps) =>
  pieces.map((piece, pieceIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the runs of a chunk have no identity besides their place.
    <Fragment key={pieceIndex}>
      {piece.header !== null && <HunkHeader header={piece.header} columns={SPLIT_COLUMNS} />}
      {piece.rows.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a hunk have no identity besides their place.
        <Fragment key={rowIndex}>
          <div className={cn('grid', SPLIT_COLUMNS)}>
            <SplitHalf line={row.left} side="old" highlight={highlight} review={review} />
            <SplitHalf line={row.right} side="new" highlight={highlight} review={review} />
          </div>
          <CommentThread
            review={review}
            matches={(anchor) => endsAt(anchor, row.left?.oldNumber ?? null, row.right?.newNumber ?? null)}
          />
        </Fragment>
      ))}
    </Fragment>
  ));
