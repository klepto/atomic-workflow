import { Fragment } from 'react';
import { cn } from '@/lib/utils.ts';
import { endsAt } from '@/review/comment-anchor.ts';
import { CommentThread } from '@/review/comment-thread.tsx';
import type { UnifiedPiece } from '@/review/diff-chunks.ts';
import type { FileReview } from '@/review/file-review.ts';
import { CodeCell, HunkHeader, LineButton, Rail } from '@/review/line-cells.tsx';
import { codeTint, markOf, numberTint } from '@/review/line-mark.ts';
import { numberOn, sideOf } from '@/review/patch.ts';
import type { FileHighlight } from '@/review/use-file-highlight.ts';

/**
 * Props of `UnifiedBody`.
 */
interface UnifiedBodyProps {
  /**
   * Runs of the lines of the hunks of the file to show.
   */
  readonly pieces: readonly UnifiedPiece[];

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
 * Columns of a line of the unified view: the bar, the numbers of the line, and its code.
 */
const UNIFIED_COLUMNS = 'grid-cols-[4px_6rem_minmax(0,1fr)]';

/**
 * Runs `pieces` of the hunks of a file in one column, each with the header of its hunk when it starts the hunk, each
 * line with its old and its new number and its code in the colors of `highlight`, and the threads of the comments of
 * `review` below the lines they end at.
 */
export const UnifiedBody = ({ pieces, highlight, review }: UnifiedBodyProps) =>
  pieces.map((piece, pieceIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the runs of a chunk have no identity besides their place.
    <Fragment key={pieceIndex}>
      {piece.header !== null && <HunkHeader header={piece.header} columns={UNIFIED_COLUMNS} />}
      {piece.lines.map((line, lineIndex) => {
        const side = sideOf(line);
        const mark = markOf(line, review);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a hunk have no identity besides their place.
          <Fragment key={lineIndex}>
            <div className={cn('grid', UNIFIED_COLUMNS)}>
              <Rail mark={mark} />
              <LineButton
                side={side}
                number={numberOn(line, side) ?? 0}
                oldNumber={line.oldNumber}
                newNumber={line.newNumber}
                className={cn('grid grid-cols-2 gap-2', numberTint(line, mark))}
                onSelect={review.onSelectLine}
              />
              <CodeCell line={line} highlight={highlight} className={codeTint(line, mark)} />
            </div>
            <CommentThread review={review} matches={(anchor) => endsAt(anchor, line.oldNumber, line.newNumber)} />
          </Fragment>
        );
      })}
    </Fragment>
  ));
