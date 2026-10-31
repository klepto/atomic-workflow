import { ChevronRight, LoaderCircle, MessageSquarePlus, RotateCw } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import { CommentThread } from '@/review/comment-thread.tsx';
import { DiffBody } from '@/review/diff-body.tsx';
import { FilePath } from '@/review/file-path.tsx';
import type { FileReview } from '@/review/file-review.ts';
import { FILE_STATUSES } from '@/review/file-status.ts';
import type { FoldReason } from '@/review/fold-reason.ts';
import { LineCounts } from '@/review/line-counts.tsx';
import type { FileDiff } from '@/review/patch.ts';
import type { FileLines, ReviewFile } from '@/review/use-changes.ts';
import type { DiffLayout } from '@/review/use-diff-layout.ts';

/**
 * Props of `FileDiffView`.
 */
interface FileDiffViewProps {
  /**
   * Identifier of the section of the file in the page, which the list of the files scrolls to.
   */
  readonly id: string;

  /**
   * Changed file, with its summary and its lines.
   */
  readonly file: ReviewFile;

  /**
   * Layout of the lines.
   */
  readonly layout: DiffLayout;

  /**
   * Whether the lines of the file are folded.
   */
  readonly collapsed: boolean;

  /**
   * Why the file shows folded until the reviewer unfolds it, or `undefined` when it shows unfolded.
   */
  readonly reason: FoldReason | undefined;

  /**
   * Folds the lines of the file `path` when they show, and shows them when they are folded.
   */
  readonly onToggle: (path: string) => void;

  /**
   * Loads the lines of the file `path` again, after their load failed.
   */
  readonly onRetry: (path: string) => void;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Props of `LinesStatus`.
 */
interface LinesStatusProps {
  /**
   * Lines of the file, while they load or once their load failed.
   */
  readonly lines: Exclude<FileLines, { state: 'loaded' }>;

  /**
   * Loads the lines of the file again.
   */
  readonly onRetry: () => void;
}

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
 * Line in place of the lines of a file while they load, or the message of their failed load with a button that loads
 * them again.
 */
const LinesStatus = ({ lines, onRetry }: LinesStatusProps) =>
  lines.state === 'loading' ? (
    <p className="flex items-center gap-2 px-4 py-3 font-sans text-muted-foreground text-sm">
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      Loading the changes of the file
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 font-sans text-sm">
      <p role="alert" className="min-w-0 flex-1 text-destructive">
        {`The changes of the file cannot be loaded: ${lines.message}`}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        Load again
      </Button>
    </div>
  );

/**
 * Changes of the file `file`, with the comments of `review` on them: a header that stays in view while its file
 * scrolls, with the status of the file, its path, where it moved from, why it shows folded, its line counts, and the
 * buttons that fold it and that comment on the whole file. A click on its path folds or shows it too. Below it, the
 * comments on the whole file, then its lines in the layout `layout`, or one sentence about the change where it has
 * none, such as for a file that was only moved. While the lines of a big file load, or once their load failed, a line
 * says so in their place, even while the file is folded. A folded file renders none of its lines. Each line number is
 * a button that selects its line to comment on. It renders again only when one of its props changes, so that a change of
 * the review elsewhere, such as in the overall comment, does not render its lines again.
 */
export const FileDiffView = memo(
  ({ id, file, layout, collapsed, reason, onToggle, onRetry, review }: FileDiffViewProps) => {
    const { summary, lines } = file;
    const { icon: Icon, words } = FILE_STATUSES[summary.status];
    const moved = summary.oldPath !== null && summary.oldPath !== summary.path;
    const open = !collapsed || lines.state !== 'loaded';
    return (
      <section id={id} aria-label={summary.path}>
        <header className="sticky top-0 z-10 bg-background">
          <div
            className={cn(
              'flex min-w-0 items-center gap-2 border bg-card px-2 py-1.5 text-sm',
              open ? 'rounded-t-lg' : 'rounded-lg',
            )}
          >
            <h3 className="flex min-w-0 flex-1">
              <Hint description={collapsed ? 'Show the changes of the file' : 'Hide the changes of the file'}>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() => onToggle(summary.path)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-0.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        'size-4 transition-transform motion-reduce:transition-none',
                        !collapsed && 'rotate-90',
                      )}
                    />
                  </span>
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="sr-only">{`${words}: `}</span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <FilePath path={summary.path} />
                    {moved && (
                      <span className="hidden min-w-0 truncate text-muted-foreground text-xs md:inline">
                        {`from ${summary.oldPath}`}
                      </span>
                    )}
                  </span>
                  {reason !== undefined && (
                    <span className="shrink-0 rounded-sm border px-1.5 py-px font-medium text-muted-foreground text-xs">
                      <span className="sr-only">{collapsed ? ', folded: ' : ', '}</span>
                      {reason}
                    </span>
                  )}
                </button>
              </Hint>
            </h3>
            <LineCounts additions={summary.additions} deletions={summary.deletions} />
            <Hint description="Comment on the whole file">
              <Button variant="ghost" size="sm" className="shrink-0" onClick={review.onSelectFile}>
                <MessageSquarePlus aria-hidden="true" />
                <span className="hidden sm:inline">Comment on file</span>
                <span className="sr-only sm:hidden">Comment on file</span>
              </Button>
            </Hint>
          </div>
        </header>
        {open && (
          <div className="overflow-hidden rounded-b-lg border border-t-0 font-mono text-xs leading-5">
            {!collapsed && <CommentThread review={review} matches={(anchor) => anchor.kind === 'file'} />}
            {lines.state === 'loaded' ? (
              <>
                {lines.diff.hunks.length === 0 && (
                  <p className="px-4 py-3 font-sans text-muted-foreground text-sm">{noticeOf(lines.diff)}</p>
                )}
                <DiffBody file={lines.diff} layout={layout} review={review} />
              </>
            ) : (
              <LinesStatus lines={lines} onRetry={() => onRetry(summary.path)} />
            )}
          </div>
        )}
      </section>
    );
  },
);
