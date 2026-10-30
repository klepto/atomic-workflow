import { memo } from 'react';
import type { ThemedToken } from 'shiki/core';
import { Hint } from '@/components/ui/hint.tsx';
import { tokenStyle } from '@/lib/code-highlight.ts';
import { cn } from '@/lib/utils.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { LineMark } from '@/review/line-mark.ts';
import { type DiffLine, type DiffSide, signOf } from '@/review/patch.ts';
import type { FileHighlight } from '@/review/use-file-highlight.ts';

/**
 * Props of `Rail`.
 */
interface RailProps {
  /**
   * How the line of the bar stands among the comments of the review.
   */
  readonly mark: LineMark;
}

/**
 * Props of `CodeText`.
 */
interface CodeTextProps {
  /**
   * Line whose text shows.
   */
  readonly line: DiffLine;

  /**
   * Colored pieces of the text of the line, or `undefined` while they load or for a line without colors.
   */
  readonly tokens: readonly ThemedToken[] | undefined;
}

/**
 * Props of `CodeCell`.
 */
interface CodeCellProps {
  /**
   * Line whose sign and text show.
   */
  readonly line: DiffLine;

  /**
   * Colors of the lines of the file, or `undefined` while they load.
   */
  readonly highlight: FileHighlight | undefined;

  /**
   * Classes of the cell, beside its own.
   */
  readonly className?: string;
}

/**
 * Props of `LineButton`.
 */
interface LineButtonProps {
  /**
   * Side of the line that the button selects.
   */
  readonly side: DiffSide;

  /**
   * Number of the line on the side `side`.
   */
  readonly number: number;

  /**
   * Old number to show, `null` for an empty cell, or `undefined` to show no cell.
   */
  readonly oldNumber?: number | null;

  /**
   * New number to show, `null` for an empty cell, or `undefined` to show no cell.
   */
  readonly newNumber?: number | null;

  /**
   * Classes of the button, beside its own.
   */
  readonly className: string;

  /**
   * Selects the line to comment on, or extends the selection to it.
   */
  readonly onSelect: FileReview['onSelectLine'];
}

/**
 * Props of `HunkHeader`.
 */
interface HunkHeaderProps {
  /**
   * Header line of the hunk.
   */
  readonly header: string;

  /**
   * Classes of the columns of the grid of the diff.
   */
  readonly columns: string;
}

/**
 * Bar at the left of a line: in the primary color while a comment covers the line, lighter while the selection covers
 * it, and empty otherwise. The bars of the lines of one comment join into one bracket.
 */
export const Rail = ({ mark }: RailProps) => (
  <span
    aria-hidden="true"
    className={cn(mark === 'commented' && 'bg-primary', mark === 'selected' && 'bg-primary/45')}
  />
);

/**
 * Text of the line `line`, in the colors `tokens` once they loaded, and without colors before.
 */
const CodeText = ({ line, tokens }: CodeTextProps) => {
  if (line.text === '') return ' ';
  if (tokens === undefined) return line.text;
  return tokens.map((token) => (
    <span key={token.offset} style={tokenStyle(token)}>
      {token.content}
    </span>
  ));
};

/**
 * Sign of the line `line` and its text in the colors of `highlight`, which wraps rather than scrolls. A screen reader
 * hears whether the line was added or deleted.
 */
export const CodeCell = ({ line, highlight, className }: CodeCellProps) => (
  <div className={cn('flex min-w-0 px-2', className)}>
    <span aria-hidden="true" className="w-4 shrink-0 select-none text-muted-foreground">
      {signOf(line)}
    </span>
    {line.kind !== 'context' && <span className="sr-only">{line.kind === 'add' ? 'Added: ' : 'Deleted: '}</span>}
    <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
      <CodeText line={line} tokens={highlight?.get(line)} />
      {line.noNewline && <span className="ml-2 select-none text-muted-foreground">No newline at end of file</span>}
    </span>
  </div>
);

/**
 * Button that selects the line `number` of the side `side` to comment on, through `onSelect`. Shift and a click extend
 * the selection to it instead. It shows `oldNumber` and `newNumber`, each that is not `undefined`, and `null` as an
 * empty cell. Its hint says that a click comments on the line, and that a shift and a click extend the selection. It
 * renders again only when one of its props changes, so a diff of many lines keeps the cost of the hints low while the
 * review changes.
 */
export const LineButton = memo(({ side, number, oldNumber, newNumber, className, onSelect }: LineButtonProps) => (
  <Hint description="Comment on this line" note="Shift-click to extend the selection">
    <button
      type="button"
      aria-label={`Comment on ${side === 'old' ? 'old ' : ''}line ${number}`}
      onClick={(event) => onSelect(side, number, event.shiftKey)}
      className={cn(
        'cursor-pointer select-none px-2 text-right text-muted-foreground tabular-nums outline-none hover:bg-primary/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        className,
      )}
    >
      {oldNumber !== undefined && <span>{oldNumber ?? ''}</span>}
      {newNumber !== undefined && <span>{newNumber ?? ''}</span>}
    </button>
  </Hint>
));

/**
 * Header line `header` of a hunk, across the whole width of the diff with the columns `columns`.
 */
export const HunkHeader = ({ header, columns }: HunkHeaderProps) => (
  <div className={cn('grid bg-muted/70 text-muted-foreground', columns)}>
    <span />
    <span className="truncate px-2 py-0.5 [grid-column:2/-1]">{header}</span>
  </div>
);
