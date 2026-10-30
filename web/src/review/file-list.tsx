import { MessageSquare } from 'lucide-react';
import { Hint } from '@/components/ui/hint.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { counted } from '@/review/counted.ts';
import { FilePath } from '@/review/file-path.tsx';
import { FILE_STATUSES } from '@/review/file-status.ts';
import { LayoutToggle } from '@/review/layout-toggle.tsx';
import { LineCounts } from '@/review/line-counts.tsx';
import type { FileDiff } from '@/review/patch.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';
import type { DiffLayout } from '@/review/use-diff-layout.ts';

/**
 * Props of `FileList`.
 */
interface FileListProps {
  /**
   * Changed files, in their order.
   */
  readonly files: readonly FileDiff[];

  /**
   * Review, whose comments each row counts.
   */
  readonly draft: ReviewDraft;

  /**
   * Layout that the diff shows.
   */
  readonly layout: DiffLayout;

  /**
   * Shows the diff in the layout `layout`.
   */
  readonly onLayout: (layout: DiffLayout) => void;

  /**
   * Scrolls to the file at `index` of `files`.
   */
  readonly onJump: (index: number) => void;
}

/**
 * List of the changed files above the diff: how many files changed with their line counts and the layout of the
 * diff, then one row per file with its status, its path, the number of its comments and its line counts. A click on a
 * row scrolls to its file.
 */
export const FileList = ({ files, draft, layout, onLayout, onJump }: FileListProps) => (
  <nav aria-label="Changed files" className="overflow-hidden rounded-lg border">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card px-3 py-2">
      <h2 className="font-medium text-sm">{counted(files.length, 'file changed', 'files changed')}</h2>
      <LineCounts
        additions={files.reduce((sum, file) => sum + file.additions, 0)}
        deletions={files.reduce((sum, file) => sum + file.deletions, 0)}
      />
      <div className="ml-auto">
        <LayoutToggle layout={layout} onChange={onLayout} />
      </div>
    </div>
    <ScrollArea viewportClassName="max-h-80">
      <ul className="divide-y text-sm">
        {files.map((file, index) => {
          const { icon: Icon, words } = FILE_STATUSES[file.status];
          const comments = draft.comments.filter((comment) => comment.path === file.path).length;
          return (
            <li key={file.path}>
              <Hint description={`Scroll to the changes of ${file.path}`}>
                <button
                  type="button"
                  onClick={() => onJump(index)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="sr-only">{`${words}: `}</span>
                  <FilePath path={file.path} titled={false} className="flex-1 text-xs" />
                  {comments > 0 && (
                    <span className="flex shrink-0 items-center gap-1 font-medium text-primary text-xs">
                      <MessageSquare aria-hidden="true" className="size-3.5" />
                      {comments}
                      <span className="sr-only">{comments === 1 ? ' comment' : ' comments'}</span>
                    </span>
                  )}
                  <LineCounts additions={file.additions} deletions={file.deletions} />
                </button>
              </Hint>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  </nav>
);
