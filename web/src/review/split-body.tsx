import { Fragment, memo, useMemo } from 'react';
import type { ThemedToken } from 'shiki/core';
import { cn } from '@/lib/utils.ts';
import { CommentThreadView } from '@/review/comment-thread.tsx';
import type { SplitPiece } from '@/review/diff-chunks.ts';
import type { FileHighlight } from '@/review/file-highlight.ts';
import type { FileReview } from '@/review/file-review.ts';
import { CodeCell, HunkHeader, LineButton, LineNumberHint, Rail } from '@/review/line-cells.tsx';
import { codeTint, type LineMark, markOf, numberTint } from '@/review/line-mark.ts';
import { type LineThread, threadFinderOf } from '@/review/line-threads.ts';
import { type DiffLine, type DiffSide, numberOn } from '@/review/patch.ts';
import { sameProps } from '@/review/same-props.ts';
import { type LineHintEvents, useLineHint } from '@/review/use-line-hint.ts';
import { type RowActions, useRowActions } from '@/review/use-row-actions.ts';

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
   * How the line stands among the comments of the review, or `plain` for no line.
   */
  readonly mark: LineMark;

  /**
   * Colored pieces of the text of the line, or `undefined` while they load or for a line without colors.
   */
  readonly tokens: readonly ThemedToken[] | undefined;

  /**
   * Functions of the review that the half calls.
   */
  readonly actions: RowActions;

  /**
   * Props that show the hint that the body shares.
   */
  readonly hint: LineHintEvents;
}

/**
 * Props of `SplitRow`.
 */
interface SplitRowProps extends LineThread {
  /**
   * Old line at the left, or `null` for none.
   */
  readonly left: DiffLine | null;

  /**
   * New line at the right, or `null` for none.
   */
  readonly right: DiffLine | null;

  /**
   * How the old line stands among the comments of the review.
   */
  readonly leftMark: LineMark;

  /**
   * How the new line stands among the comments of the review.
   */
  readonly rightMark: LineMark;

  /**
   * Colored pieces of the text of the old line, or `undefined` while they load or for a line without colors.
   */
  readonly leftTokens: readonly ThemedToken[] | undefined;

  /**
   * Colored pieces of the text of the new line, or `undefined` while they load or for a line without colors.
   */
  readonly rightTokens: readonly ThemedToken[] | undefined;

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
 * colors `tokens`, or an empty space when the side has no line in the row.
 */
const SplitHalf = ({ line, side, mark, tokens, actions, hint }: SplitHalfProps) => {
  const number = line === null ? null : numberOn(line, side);
  if (line === null || number === null) {
    return <span aria-hidden="true" className="col-span-3 bg-muted/50" />;
  }
  return (
    <>
      <Rail mark={mark} />
      <LineButton
        side={side}
        number={number}
        oldNumber={side === 'old' ? number : undefined}
        newNumber={side === 'new' ? number : undefined}
        className={numberTint(line, mark)}
        onSelect={actions.onSelectLine}
        hint={hint}
      />
      <CodeCell line={line} tokens={tokens} className={cn(codeTint(line, mark), side === 'old' && 'border-r')} />
    </>
  );
};

/**
 * Row of the split view: the old line `left` and the new line `right`, and the thread of `comments` and `selection`
 * below it when it has one. It renders again only when what it shows changed.
 */
const SplitRow = memo(
  ({
    left,
    right,
    leftMark,
    rightMark,
    leftTokens,
    rightTokens,
    comments,
    selection,
    editing,
    actions,
    hint,
  }: SplitRowProps) => (
    <>
      <div className={cn('grid', SPLIT_COLUMNS)}>
        <SplitHalf line={left} side="old" mark={leftMark} tokens={leftTokens} actions={actions} hint={hint} />
        <SplitHalf line={right} side="new" mark={rightMark} tokens={rightTokens} actions={actions} hint={hint} />
      </div>
      {(comments.length > 0 || selection !== undefined) && (
        <CommentThreadView comments={comments} selection={selection} editing={editing} actions={actions} />
      )}
    </>
  ),
  sameProps,
);

/**
 * Runs `pieces` of the hunks of a file in two columns, each with the header of its hunk when it starts the hunk, the old
 * lines at the left and the new ones at the right, each with its code in the colors of `highlight`, and the threads of
 * the comments of `review` below the rows they end at. A change of `review` or `highlight` renders again only the rows
 * it touches.
 */
export const SplitBody = ({ pieces, highlight, review }: SplitBodyProps) => {
  const hint = useLineHint();
  const actions = useRowActions(review);
  const threadAt = useMemo(() => threadFinderOf(review), [review]);
  return (
    <>
      {pieces.map((piece, pieceIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the runs of a chunk have no identity besides their place.
        <Fragment key={pieceIndex}>
          {piece.header !== null && <HunkHeader header={piece.header} columns={SPLIT_COLUMNS} />}
          {piece.rows.map((row, rowIndex) => (
            <SplitRow
              // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a hunk have no identity besides their place.
              key={rowIndex}
              left={row.left}
              right={row.right}
              leftMark={row.left === null ? 'plain' : markOf(row.left, review)}
              rightMark={row.right === null ? 'plain' : markOf(row.right, review)}
              leftTokens={row.left === null ? undefined : highlight?.get(row.left)}
              rightTokens={row.right === null ? undefined : highlight?.get(row.right)}
              {...threadAt(row.left?.oldNumber ?? null, row.right?.newNumber ?? null)}
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
