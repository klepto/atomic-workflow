import { Fragment, memo, useMemo } from 'react';
import type { ThemedToken } from 'shiki/core';
import { cn } from '@/lib/utils.ts';
import { CommentThreadView } from '@/review/comment-thread.tsx';
import type { UnifiedPiece } from '@/review/diff-chunks.ts';
import type { FileHighlight } from '@/review/file-highlight.ts';
import type { FileReview } from '@/review/file-review.ts';
import { CodeCell, HunkHeader, LineButton, LineNumberHint, Rail } from '@/review/line-cells.tsx';
import { codeTint, type LineMark, markOf, numberTint } from '@/review/line-mark.ts';
import { type LineThread, threadFinderOf } from '@/review/line-threads.ts';
import { type DiffLine, numberOn, sideOf } from '@/review/patch.ts';
import { sameProps } from '@/review/same-props.ts';
import { type LineHintEvents, useLineHint } from '@/review/use-line-hint.ts';
import { type RowActions, useRowActions } from '@/review/use-row-actions.ts';

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
 * Props of `UnifiedRow`.
 */
interface UnifiedRowProps extends LineThread {
  /**
   * Line of the row.
   */
  readonly line: DiffLine;

  /**
   * How the line stands among the comments of the review.
   */
  readonly mark: LineMark;

  /**
   * Colored pieces of the text of the line, or `undefined` while they load or for a line without colors.
   */
  readonly tokens: readonly ThemedToken[] | undefined;

  /**
   * Functions of the review that the row calls.
   */
  readonly actions: RowActions;

  /**
   * Props that show the hint that the body shares.
   */
  readonly hint: LineHintEvents;
}

/**
 * Columns of a line of the unified view: the bar, the numbers of the line, and its code.
 */
const UNIFIED_COLUMNS = 'grid-cols-[4px_6rem_minmax(0,1fr)]';

/**
 * Line `line` of the unified view with its old and its new number and its code in the colors `tokens`, and the thread
 * of `comments` and `selection` below it when it has one. It renders again only when what it shows changed.
 */
const UnifiedRow = memo(({ line, mark, tokens, comments, selection, editing, actions, hint }: UnifiedRowProps) => {
  const side = sideOf(line);
  return (
    <>
      <div className={cn('grid', UNIFIED_COLUMNS)}>
        <Rail mark={mark} />
        <LineButton
          side={side}
          number={numberOn(line, side) ?? 0}
          oldNumber={line.oldNumber}
          newNumber={line.newNumber}
          className={cn('grid grid-cols-2 gap-2', numberTint(line, mark))}
          onSelect={actions.onSelectLine}
          hint={hint}
        />
        <CodeCell line={line} tokens={tokens} className={codeTint(line, mark)} />
      </div>
      {(comments.length > 0 || selection !== undefined) && (
        <CommentThreadView comments={comments} selection={selection} editing={editing} actions={actions} />
      )}
    </>
  );
}, sameProps);

/**
 * Runs `pieces` of the hunks of a file in one column, each with the header of its hunk when it starts the hunk, each
 * line with its old and its new number and its code in the colors of `highlight`, and the threads of the comments of
 * `review` below the lines they end at. A change of `review` or `highlight` renders again only the lines it touches.
 */
export const UnifiedBody = ({ pieces, highlight, review }: UnifiedBodyProps) => {
  const hint = useLineHint();
  const actions = useRowActions(review);
  const threadAt = useMemo(() => threadFinderOf(review), [review]);
  return (
    <>
      {pieces.map((piece, pieceIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the runs of a chunk have no identity besides their place.
        <Fragment key={pieceIndex}>
          {piece.header !== null && <HunkHeader header={piece.header} columns={UNIFIED_COLUMNS} />}
          {piece.lines.map((line, lineIndex) => (
            <UnifiedRow
              // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a hunk have no identity besides their place.
              key={lineIndex}
              line={line}
              mark={markOf(line, review)}
              tokens={highlight?.get(line)}
              {...threadAt(line.oldNumber, line.newNumber)}
              actions={actions}
              hint={hint.events}
            />
          ))}
        </Fragment>
      ))}
      <LineNumberHint hint={hint} />
    </>
  );
};
