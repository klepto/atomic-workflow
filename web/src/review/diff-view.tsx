import {
  ChevronRight,
  Copy,
  FileDiff as FileDiffIcon,
  FileMinus,
  FilePlus,
  FileSymlink,
  type LucideIcon,
  MessageSquarePlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Fragment, type KeyboardEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { cn } from '@/lib/utils.ts';
import type { DiffLine, FileDiff, FileStatus } from '@/review/patch.ts';
import {
  anchorWords,
  type CommentAnchor,
  covers,
  type DiffSide,
  numberOn,
  type ReviewComment,
  sideOf,
} from '@/review/review-draft.ts';

/**
 * How the diff shows the lines of a file: `unified` in one column, `split` with the old lines beside the new ones.
 */
export type DiffLayout = 'unified' | 'split';

/**
 * The comments of the review on one file, with what the user selected in it, and what changes them.
 */
export interface FileReview {
  /**
   * The comments on the file, in the order they were added.
   */
  comments: readonly ReviewComment[];

  /**
   * What the user selected in the file to comment on, or `undefined` while they selected nothing in it.
   */
  selection: CommentAnchor | undefined;

  /**
   * The id of the comment of the file that the user edits, or `undefined` while they edit none.
   */
  editing: string | undefined;

  /**
   * Selects the line `number` of the side `side` to comment on, or extends the selection to it with `extend`.
   */
  onSelectLine: (side: DiffSide, number: number, extend: boolean) => void;

  /**
   * Selects the whole file to comment on.
   */
  onSelectFile: () => void;

  /**
   * Adds a comment with the text `body` on the selection, and clears the selection.
   */
  onAdd: (body: string) => void;

  /**
   * Clears the selection, and ends the edit of a comment without a change.
   */
  onCancel: () => void;

  /**
   * Starts the edit of the comment `id`.
   */
  onEdit: (id: string) => void;

  /**
   * Replaces the text of the comment `id` with `body`, and ends its edit.
   */
  onSave: (id: string, body: string) => void;

  /**
   * Deletes the comment `id`.
   */
  onDelete: (id: string) => void;
}

/**
 * The icon and the words of each status of a file.
 */
export const FILE_STATUSES: Record<FileStatus, { icon: LucideIcon; words: string }> = {
  added: { icon: FilePlus, words: 'Added' },
  deleted: { icon: FileMinus, words: 'Deleted' },
  modified: { icon: FileDiffIcon, words: 'Modified' },
  renamed: { icon: FileSymlink, words: 'Renamed' },
  copied: { icon: Copy, words: 'Copied' },
};

/**
 * The count of the added and the deleted lines of a file or of a change, such as `+12 −3`.
 */
export const LineCounts = ({ additions, deletions }: { additions: number; deletions: number }) => (
  <span className="shrink-0 font-medium font-mono text-xs tabular-nums">
    <span className="text-diff-add-foreground">{`+${additions}`}</span>
    <span className="sr-only"> lines added, </span>
    <span className="ml-1.5 text-diff-delete-foreground">{`−${deletions}`}</span>
    <span className="sr-only"> lines deleted</span>
  </span>
);

/**
 * The path `path` with its directory muted and its name in full color, so the name stands out.
 */
export const FilePath = ({ path, className }: { path: string; className?: string }) => {
  const slash = path.lastIndexOf('/');
  return (
    <span className={cn('min-w-0 truncate font-mono', className)} title={path}>
      <span className="text-muted-foreground">{path.slice(0, slash + 1)}</span>
      <span className="font-medium">{path.slice(slash + 1)}</span>
    </span>
  );
};

/**
 * A field for the text of a comment, with its buttons: `Cancel`, and `submitLabel`, which hands the trimmed text to
 * `onSubmit` once it is not empty. Ctrl+Enter, or Cmd+Enter, submits too, and Escape cancels. It takes the focus when
 * it opens, and starts with the text `initial`.
 */
export const CommentComposer = ({
  label,
  initial = '',
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState(initial);
  const empty = text.trim() === '';

  /**
   * Hands the text to `onSubmit` unless it is empty.
   */
  const submit = () => {
    if (!empty) onSubmit(text.trim());
  };

  /**
   * Submits on Ctrl+Enter or Cmd+Enter, and cancels on Escape.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        // biome-ignore lint/a11y/noAutofocus: the field opens on a click that asks to write a comment.
        autoFocus
        aria-label={label}
        placeholder="Write a comment"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-20 bg-background font-sans"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-muted-foreground text-xs sm:inline">Ctrl+Enter to save</span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={empty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

/**
 * A comment of the review: its text, with the buttons that edit and delete it.
 */
const CommentCard = ({
  comment,
  onEdit,
  onDelete,
}: {
  comment: ReviewComment;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <article
    aria-label={`Comment on ${anchorWords(comment.anchor)}`}
    className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 font-sans"
  >
    <MarkdownBody text={comment.body} className="min-w-0 flex-1 leading-6" />
    <div className="-mr-1.5 flex shrink-0 gap-0.5">
      <Button variant="ghost" size="icon" className="size-7" aria-label="Edit comment" onClick={onEdit}>
        <Pencil aria-hidden="true" className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete comment"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </div>
  </article>
);

/**
 * Returns the thread of the comments of `review` whose anchor `matches` accepts, with the field for a new comment when
 * the selection is such an anchor, or `null` when there is neither. The thread hangs below the lines it points at,
 * with a bar of the primary color at its left that joins it to the bar beside those lines.
 */
const threadOf = (review: FileReview, matches: (anchor: CommentAnchor) => boolean): ReactNode => {
  const comments = review.comments.filter((comment) => matches(comment.anchor));
  const selection = review.selection !== undefined && matches(review.selection) ? review.selection : undefined;
  if (comments.length === 0 && selection === undefined) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-l-4 border-l-primary bg-muted/40 px-3 py-3">
      {comments.map((comment) =>
        comment.id === review.editing ? (
          <CommentComposer
            key={comment.id}
            label={`Edit the comment on ${anchorWords(comment.anchor)}`}
            initial={comment.body}
            submitLabel="Save"
            onSubmit={(body) => review.onSave(comment.id, body)}
            onCancel={review.onCancel}
          />
        ) : (
          <CommentCard
            key={comment.id}
            comment={comment}
            onEdit={() => review.onEdit(comment.id)}
            onDelete={() => review.onDelete(comment.id)}
          />
        ),
      )}
      {selection !== undefined && (
        <CommentComposer
          label={`Comment on ${anchorWords(selection)}`}
          submitLabel="Add comment"
          onSubmit={review.onAdd}
          onCancel={review.onCancel}
        />
      )}
    </div>
  );
};

/**
 * Returns whether `anchor` is a run of lines that ends at the old line `oldNumber` or at the new line `newNumber`.
 */
const endsAt = (anchor: CommentAnchor, oldNumber: number | null, newNumber: number | null): boolean =>
  anchor.kind === 'lines' && anchor.end === (anchor.side === 'old' ? oldNumber : newNumber);

/**
 * Returns whether `anchor` covers the line `line` on either of its sides.
 */
const coversLine = (anchor: CommentAnchor, line: DiffLine): boolean =>
  covers(anchor, 'old', line.oldNumber) || covers(anchor, 'new', line.newNumber);

/**
 * Returns how the line `line` stands among the comments of `review`: `selected` while the selection covers it,
 * `commented` while a comment covers it, and `plain` otherwise.
 */
const markOf = (line: DiffLine, review: FileReview): 'selected' | 'commented' | 'plain' => {
  if (review.selection !== undefined && coversLine(review.selection, line)) return 'selected';
  return review.comments.some((comment) => coversLine(comment.anchor, line)) ? 'commented' : 'plain';
};

/**
 * The bar at the left of a line: in the primary color while a comment covers the line, lighter while the selection
 * covers it, and empty otherwise. The bars of the lines of one comment join into one bracket.
 */
const Rail = ({ mark }: { mark: ReturnType<typeof markOf> }) => (
  <span
    aria-hidden="true"
    className={cn(mark === 'commented' && 'bg-primary', mark === 'selected' && 'bg-primary/45')}
  />
);

/**
 * The classes of the background of the code of the line `line`, by what the change did to it, or by the selection.
 */
const codeTint = (line: DiffLine, mark: ReturnType<typeof markOf>): string => {
  if (mark === 'selected') return 'bg-primary/12';
  if (line.kind === 'add') return 'bg-diff-add/12';
  return line.kind === 'delete' ? 'bg-diff-delete/12' : '';
};

/**
 * The classes of the background of the number of the line `line`, by what the change did to it, or by the selection.
 */
const numberTint = (line: DiffLine, mark: ReturnType<typeof markOf>): string => {
  if (mark === 'selected') return 'bg-primary/20 text-foreground';
  if (line.kind === 'add') return 'bg-diff-add/20';
  return line.kind === 'delete' ? 'bg-diff-delete/20' : '';
};

/**
 * The sign of the line `line` and its text, which wraps rather than scrolls. A screen reader hears whether the line
 * was added or deleted.
 */
const Code = ({ line, className }: { line: DiffLine; className?: string }) => (
  <div className={cn('flex min-w-0 px-2', className)}>
    <span aria-hidden="true" className="w-4 shrink-0 select-none text-muted-foreground">
      {line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}
    </span>
    {line.kind !== 'context' && <span className="sr-only">{line.kind === 'add' ? 'Added: ' : 'Deleted: '}</span>}
    <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
      {line.text === '' ? ' ' : line.text}
      {line.noNewline && <span className="ml-2 select-none text-muted-foreground">No newline at end of file</span>}
    </span>
  </div>
);

/**
 * The button that selects the line `number` of the side `side` to comment on. Shift and a click extend the selection
 * to it instead. It shows `children`, the numbers of the line.
 */
const LineButton = ({
  side,
  number,
  review,
  className,
  children,
}: {
  side: DiffSide;
  number: number;
  review: FileReview;
  className: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    title="Comment on this line. Shift-click to extend."
    aria-label={`Comment on ${side === 'old' ? 'old ' : ''}line ${number}`}
    onClick={(event) => review.onSelectLine(side, number, event.shiftKey)}
    className={cn(
      'cursor-pointer select-none px-2 text-right text-muted-foreground tabular-nums outline-none hover:bg-primary/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
      className,
    )}
  >
    {children}
  </button>
);

/**
 * The header line of a hunk, across the whole width of the diff.
 */
const HunkHeader = ({ header, columns }: { header: string; columns: string }) => (
  <div className={cn('grid bg-muted/70 text-muted-foreground', columns)}>
    <span />
    <span className="truncate px-2 py-0.5 [grid-column:2/-1]">{header}</span>
  </div>
);

/**
 * The columns of a line of the unified view: the bar, the numbers of the line, and its code.
 */
const UNIFIED_COLUMNS = 'grid-cols-[4px_6rem_minmax(0,1fr)]';

/**
 * The hunks of the file of `review` in one column, each line with its old and its new number, and the threads of its
 * comments below the lines they end at.
 */
const UnifiedBody = ({ file, review }: { file: FileDiff; review: FileReview }) =>
  file.hunks.map((hunk, hunkIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the hunks of a file have no identity besides their place.
    <Fragment key={hunkIndex}>
      <HunkHeader header={hunk.header} columns={UNIFIED_COLUMNS} />
      {hunk.lines.map((line, lineIndex) => {
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
                review={review}
                className={cn('grid grid-cols-2 gap-2', numberTint(line, mark))}
              >
                <span>{line.oldNumber ?? ''}</span>
                <span>{line.newNumber ?? ''}</span>
              </LineButton>
              <Code line={line} className={codeTint(line, mark)} />
            </div>
            {threadOf(review, (anchor) => endsAt(anchor, line.oldNumber, line.newNumber))}
          </Fragment>
        );
      })}
    </Fragment>
  ));

/**
 * A row of the split view: the old line at the left and the new line at the right, either of them missing where the
 * change added or deleted more lines on one side. A line that both sides share is on both.
 */
interface SplitRow {
  /**
   * The old line, or `null` for none.
   */
  left: DiffLine | null;

  /**
   * The new line, or `null` for none.
   */
  right: DiffLine | null;
}

/**
 * Returns the lines `lines` of a hunk as rows of the split view: each run of deleted lines beside the run of added
 * lines that follows it, and each shared line beside itself.
 */
const splitRowsOf = (lines: readonly DiffLine[]): SplitRow[] => {
  const rows: SplitRow[] = [];
  let deleted: DiffLine[] = [];
  let added: DiffLine[] = [];

  /**
   * Pairs the deleted and the added lines of the current run into rows, and starts a new run.
   */
  const flush = () => {
    for (let index = 0; index < Math.max(deleted.length, added.length); index += 1) {
      rows.push({ left: deleted[index] ?? null, right: added[index] ?? null });
    }
    deleted = [];
    added = [];
  };

  for (const line of lines) {
    if (line.kind === 'delete') deleted.push(line);
    else if (line.kind === 'add') added.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
};

/**
 * The columns of a row of the split view: for each side, the bar, the number of the line, and its code.
 */
const SPLIT_COLUMNS = 'grid-cols-[4px_3rem_minmax(0,1fr)_4px_3rem_minmax(0,1fr)]';

/**
 * One side of a row of the split view: the line `line` of the side `side` with its bar and its number, or an empty
 * space when the side has no line in the row.
 */
const SplitHalf = ({ line, side, review }: { line: DiffLine | null; side: DiffSide; review: FileReview }) => {
  const number = line === null ? null : numberOn(line, side);
  if (line === null || number === null) {
    return <span aria-hidden="true" className="col-span-3 bg-muted/50" />;
  }
  const mark = markOf(line, review);
  return (
    <>
      <Rail mark={mark} />
      <LineButton side={side} number={number} review={review} className={numberTint(line, mark)}>
        {number}
      </LineButton>
      <Code line={line} className={cn(codeTint(line, mark), side === 'old' && 'border-r')} />
    </>
  );
};

/**
 * The hunks of the file of `review` in two columns, the old lines at the left and the new ones at the right, and the
 * threads of the comments below the rows they end at.
 */
const SplitBody = ({ file, review }: { file: FileDiff; review: FileReview }) =>
  file.hunks.map((hunk, hunkIndex) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: the hunks of a file have no identity besides their place.
    <Fragment key={hunkIndex}>
      <HunkHeader header={hunk.header} columns={SPLIT_COLUMNS} />
      {splitRowsOf(hunk.lines).map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a hunk have no identity besides their place.
        <Fragment key={rowIndex}>
          <div className={cn('grid', SPLIT_COLUMNS)}>
            <SplitHalf line={row.left} side="old" review={review} />
            <SplitHalf line={row.right} side="new" review={review} />
          </div>
          {threadOf(review, (anchor) => endsAt(anchor, row.left?.oldNumber ?? null, row.right?.newNumber ?? null))}
        </Fragment>
      ))}
    </Fragment>
  ));

/**
 * Returns the sentence that stands in place of the lines of the file `file` when it has none, such as for a file that
 * was only moved.
 */
const noticeOf = (file: FileDiff): string => {
  if (file.binary) return 'Binary file. Its content is not shown.';
  if (file.status === 'renamed') return `Moved from ${file.oldPath} with no change to its content.`;
  if (file.status === 'copied') return `Copied from ${file.oldPath} with no change to its content.`;
  if (file.modeChange !== null) return `Mode changed from ${file.modeChange.old} to ${file.modeChange.new}.`;
  return 'Empty file.';
};

/**
 * The changes of the file `file`, with the comments of `review` on them: a header that stays in view while its file
 * scrolls, with the status of the file, its path, where it moved from, its line counts, and the buttons that fold it
 * and that comment on the whole file. Below it, the comments on the whole file, then its lines in the layout
 * `layout`, or one sentence about the change where it has none, such as for a file that was only moved. Each line
 * number is a button that selects its line to comment on.
 */
export const FileDiffView = ({
  id,
  file,
  layout,
  collapsed,
  onToggle,
  review,
}: {
  id: string;
  file: FileDiff;
  layout: DiffLayout;
  collapsed: boolean;
  onToggle: () => void;
  review: FileReview;
}) => {
  const { icon: Icon, words } = FILE_STATUSES[file.status];
  const moved = file.oldPath !== null && file.oldPath !== file.path;
  return (
    <section id={id} aria-label={file.path} className="scroll-mt-16">
      <header
        className={cn(
          'sticky top-14 z-10 flex min-w-0 items-center gap-2 border bg-card px-2 py-1.5 text-sm',
          collapsed ? 'rounded-lg' : 'rounded-t-lg',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${file.path}` : `Hide ${file.path}`}
          onClick={onToggle}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn('transition-transform motion-reduce:transition-none', !collapsed && 'rotate-90')}
          />
        </Button>
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{words}</span>
        <h3 className="flex min-w-0 flex-1 items-baseline gap-2">
          <FilePath path={file.path} />
          {moved && (
            <span className="hidden min-w-0 truncate text-muted-foreground text-xs md:inline">
              {`from ${file.oldPath}`}
            </span>
          )}
        </h3>
        <LineCounts additions={file.additions} deletions={file.deletions} />
        <Button variant="ghost" size="sm" className="shrink-0" onClick={review.onSelectFile}>
          <MessageSquarePlus aria-hidden="true" />
          <span className="hidden sm:inline">Comment on file</span>
          <span className="sr-only sm:hidden">Comment on file</span>
        </Button>
      </header>
      {!collapsed && (
        <div className="overflow-hidden rounded-b-lg border border-t-0 font-mono text-xs leading-5">
          {threadOf(review, (anchor) => anchor.kind === 'file')}
          {file.hunks.length === 0 && (
            <p className="px-4 py-3 font-sans text-muted-foreground text-sm">{noticeOf(file)}</p>
          )}
          {layout === 'unified' ? (
            <UnifiedBody file={file} review={review} />
          ) : (
            <SplitBody file={file} review={review} />
          )}
        </div>
      )}
    </section>
  );
};
