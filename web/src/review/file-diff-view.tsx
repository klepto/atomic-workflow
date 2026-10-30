import { ChevronRight, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import { CommentThread } from '@/review/comment-thread.tsx';
import { DiffBody } from '@/review/diff-body.tsx';
import { FilePath } from '@/review/file-path.tsx';
import type { FileReview } from '@/review/file-review.ts';
import { FILE_STATUSES } from '@/review/file-status.ts';
import { LineCounts } from '@/review/line-counts.tsx';
import type { FileDiff } from '@/review/patch.ts';
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
   * Changes of the file.
   */
  readonly file: FileDiff;

  /**
   * Layout of the lines.
   */
  readonly layout: DiffLayout;

  /**
   * Whether the lines of the file are folded.
   */
  readonly collapsed: boolean;

  /**
   * Folds the lines of the file when they show, and shows them when they are folded.
   */
  readonly onToggle: () => void;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
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
 * Changes of the file `file`, with the comments of `review` on them: a header that stays in view while its file
 * scrolls, with the status of the file, its path, where it moved from, its line counts, and the buttons that fold it
 * and that comment on the whole file. Below it, the comments on the whole file, then its lines in the layout
 * `layout`, or one sentence about the change where it has none, such as for a file that was only moved. Each line
 * number is a button that selects its line to comment on.
 */
export const FileDiffView = ({ id, file, layout, collapsed, onToggle, review }: FileDiffViewProps) => {
  const { icon: Icon, words } = FILE_STATUSES[file.status];
  const moved = file.oldPath !== null && file.oldPath !== file.path;
  return (
    <section id={id} aria-label={file.path}>
      <header className="sticky top-0 z-10 bg-background">
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 border bg-card px-2 py-1.5 text-sm',
            collapsed ? 'rounded-lg' : 'rounded-t-lg',
          )}
        >
          <Hint description={collapsed ? 'Show the changes of the file' : 'Hide the changes of the file'}>
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
          </Hint>
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
          <Hint description="Comment on the whole file">
            <Button variant="ghost" size="sm" className="shrink-0" onClick={review.onSelectFile}>
              <MessageSquarePlus aria-hidden="true" />
              <span className="hidden sm:inline">Comment on file</span>
              <span className="sr-only sm:hidden">Comment on file</span>
            </Button>
          </Hint>
        </div>
      </header>
      {!collapsed && (
        <div className="overflow-hidden rounded-b-lg border border-t-0 font-mono text-xs leading-5">
          <CommentThread review={review} matches={(anchor) => anchor.kind === 'file'} />
          {file.hunks.length === 0 && (
            <p className="px-4 py-3 font-sans text-muted-foreground text-sm">{noticeOf(file)}</p>
          )}
          <DiffBody file={file} layout={layout} review={review} />
        </div>
      )}
    </section>
  );
};
