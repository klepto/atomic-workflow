import { useState } from 'react';
import type { TaskSummary, Ticket } from '@/api/types.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { ChangesNotice } from '@/review/changes-notice.tsx';
import { counted } from '@/review/counted.ts';
import { FileDiffView } from '@/review/file-diff-view.tsx';
import { FileList } from '@/review/file-list.tsx';
import { OverallComment } from '@/review/overall-comment.tsx';
import { ReviewActionBar } from '@/review/review-action-bar.tsx';
import { EMPTY_DRAFT } from '@/review/review-draft.ts';
import { useChanges } from '@/review/use-changes.ts';
import { useCommentSelection } from '@/review/use-comment-selection.ts';
import { useDiffLayout } from '@/review/use-diff-layout.ts';
import { useReviewActions } from '@/review/use-review-actions.ts';
import { useReviewDraft } from '@/review/use-review-draft.ts';

/**
 * Props of `ReviewPage`.
 */
interface ReviewPageProps {
  /**
   * Task of the ticket.
   */
  readonly task: TaskSummary;

  /**
   * Ticket to review.
   */
  readonly ticket: Ticket;

  /**
   * Opens the chat of the session `sessionId`.
   */
  readonly onOpenChat: (sessionId: string) => void;
}

/**
 * Returns the identifier of the section of the file at `index` among the files of the changes.
 */
const fileIdOf = (index: number): string => `review-file-${index}`;

/**
 * Review of the ticket `ticket` of the task `task`, as a page of its changes: the list of the changed files at the
 * top, then the diff of each file, then a field for the overall comment, with the bar of the actions at the bottom. A
 * click on a line number selects that line to comment on, and a shift and a click extend the selection. Each file
 * takes comments on the whole file too, such as for a file that was only moved. The comments stay in the browser store
 * until they are sent. `Request changes` adds a ticket that makes the changes that the comments ask for, approves this
 * ticket when it needs review, and opens the new ticket. `Approve` discards the comments and approves this ticket.
 * When the landing of the task stops on a conflict, the orchestrator of the task takes over, and `onOpenChat` opens
 * its chat.
 */
export const ReviewPage = ({ task, ticket, onOpenChat }: ReviewPageProps) => {
  const landed = ticket.status === 'needs-review' || ticket.status === 'done';
  const changes = useChanges(task.id, ticket.id, landed);
  const [draft, update] = useReviewDraft(task.id, ticket.id);
  const [layout, setLayout] = useDiffLayout();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const files = changes.state === 'loaded' ? changes.files : [];

  /**
   * Shows the file `path` if it is folded.
   */
  const unfold = (path: string | undefined): void =>
    setCollapsed((current) => new Set([...current].filter((other) => other !== path)));

  const selection = useCommentSelection(draft, update, unfold);
  const actions = useReviewActions(task, ticket, {
    draft,
    changes,
    onSent: () => {
      update(() => EMPTY_DRAFT);
      selection.clear();
    },
    onOpenChat,
  });

  /**
   * Shows the file at `index` if it is folded, and scrolls to it.
   */
  const jumpTo = (index: number): void => {
    unfold(files[index]?.path);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(fileIdOf(index))?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  };

  /**
   * Folds the file `path` when it shows, and shows it when it is folded.
   */
  const toggle = (path: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const headline =
    changes.state === 'loaded'
      ? `Commit ${changes.commit.slice(0, 7)}, ${counted(changes.files.length, 'file', 'files')} changed`
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="mt-14 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-6 pb-10 md:px-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="min-w-0 truncate font-semibold text-xl tracking-tight">
              <span className="mr-2 font-normal text-muted-foreground tabular-nums">{`#${ticket.id}`}</span>
              {ticket.slug}
            </h1>
            <p className="max-w-3xl text-muted-foreground text-sm leading-6">{ticket.summary}</p>
            {headline !== undefined && <p className="font-mono text-muted-foreground text-xs">{headline}</p>}
          </header>
          {changes.state === 'loaded' && changes.files.length > 0 ? (
            <>
              <FileList files={files} draft={draft} layout={layout} onLayout={setLayout} onJump={jumpTo} />
              <div className="flex flex-col gap-4">
                {files.map((file, index) => (
                  <FileDiffView
                    key={file.path}
                    id={fileIdOf(index)}
                    file={file}
                    layout={layout}
                    collapsed={collapsed.has(file.path)}
                    onToggle={() => toggle(file.path)}
                    review={selection.reviewOf(file.path)}
                  />
                ))}
              </div>
            </>
          ) : (
            <ChangesNotice changes={changes} landed={landed} />
          )}
          {landed && changes.state !== 'loading' && (
            <OverallComment
              value={draft.overall}
              onChange={(overall) => update((current) => ({ ...current, overall }))}
            />
          )}
        </div>
      </ScrollArea>
      {landed && <ReviewActionBar task={task} ticket={ticket} draft={draft} actions={actions} />}
    </div>
  );
};
