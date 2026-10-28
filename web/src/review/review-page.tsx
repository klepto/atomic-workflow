import { Columns2, MessageSquare, Rows2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { RequestedChanges, TaskSummary, Ticket, TicketCommit } from '@/api/types.ts';
import { Button } from '@/components/ui/button.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { cn } from '@/lib/utils.ts';
import {
  type DiffLayout,
  FILE_STATUSES,
  FileDiffView,
  FilePath,
  type FileReview,
  LineCounts,
} from '@/review/diff-view.tsx';
import { type FileDiff, parsePatch } from '@/review/patch.ts';
import {
  type CommentAnchor,
  type DiffSide,
  EMPTY_DRAFT,
  isEmptyDraft,
  newCommentId,
  type ReviewDraft,
  reviewMarkdown,
  useReviewDraft,
} from '@/review/review-draft.ts';
import { navigate } from '@/routing/navigation.ts';
import { RouteLink } from '@/routing/route-link.tsx';
import { taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { approveTicket } from '@/tasks/approve-ticket.ts';

/**
 * The changes of a ticket as the review reads them: while they load, once the read failed, once no commit holds them,
 * and once they loaded, with the commit and its files.
 */
type Changes =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'none' }
  | { state: 'loaded'; commit: string; files: readonly FileDiff[] };

/**
 * Returns the changes of the ticket `ticketId` of the task `taskId`, read once its work landed, as `landed` says, and
 * again whenever one of them changes. While its work has not landed, they are `none`.
 */
const useChanges = (taskId: number, ticketId: number, landed: boolean): Changes => {
  const [changes, setChanges] = useState<Changes>({ state: 'loading' });
  useEffect(() => {
    if (!landed) {
      setChanges({ state: 'none' });
      return;
    }
    let current = true;
    setChanges({ state: 'loading' });
    call<TicketCommit | null>('ticketDiff', { taskId, ticketId }).then(
      (found) => {
        if (!current) return;
        setChanges(found === null ? { state: 'none' } : { state: 'loaded', ...found, files: parsePatch(found.patch) });
      },
      (error: unknown) => {
        if (current) setChanges({ state: 'failed', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [taskId, ticketId, landed]);
  return changes;
};

/**
 * The key of the local storage that holds the layout of the diff that the user chose last.
 */
const LAYOUT_KEY = 'atomic-workflow:diff-layout';

/**
 * Returns the layout of the diff that the user chose last, `unified` by default, with the function that changes it and
 * keeps it in the local storage of the browser.
 */
const useDiffLayout = (): [DiffLayout, (layout: DiffLayout) => void] => {
  const [layout, setLayout] = useState<DiffLayout>(() =>
    window.localStorage.getItem(LAYOUT_KEY) === 'split' ? 'split' : 'unified',
  );

  /**
   * Shows the diff in the layout `next`, and keeps it for the next review.
   */
  const choose = (next: DiffLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // The layout stays for this page only.
    }
  };

  return [layout, choose];
};

/**
 * What the user selected to comment on: the anchor in the file `path`, and the line `origin` that a shift and a click
 * extend the selection from, or `null` for a selection of the whole file.
 */
interface Selection {
  /**
   * Path that names the file of the selection.
   */
  path: string;

  /**
   * What the selection covers in the file.
   */
  anchor: CommentAnchor;

  /**
   * The line that the selection started at, or `null` for the whole file.
   */
  origin: number | null;
}

/**
 * Returns the id of the section of the file at `index` among the files of the changes.
 */
const fileIdOf = (index: number) => `review-file-${index}`;

/**
 * Returns `count` with the word `one` or `many` after it, such as `1 comment` or `3 comments`.
 */
const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Returns the number of the comments of `draft`, with its overall comment as one more.
 */
const commentCountOf = (draft: ReviewDraft) => draft.comments.length + (draft.overall.trim() === '' ? 0 : 1);

/**
 * The two buttons that choose the layout `layout` of the diff, `Unified` and `Split`.
 */
const LayoutToggle = ({ layout, onChange }: { layout: DiffLayout; onChange: (layout: DiffLayout) => void }) => (
  <div role="group" aria-label="Diff layout" className="flex rounded-md border bg-background p-0.5">
    {(
      [
        { value: 'unified', label: 'Unified', icon: Rows2 },
        { value: 'split', label: 'Split', icon: Columns2 },
      ] as const
    ).map(({ value, label, icon: Icon }) => (
      <button
        key={value}
        type="button"
        aria-pressed={layout === value}
        onClick={() => onChange(value)}
        className={cn(
          'flex items-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-2 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          layout === value ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground',
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </button>
    ))}
  </div>
);

/**
 * The list of the changed files above the diff: how many files changed with their line counts and the layout of the
 * diff, then one row per file with its status, its path, the number of its comments and its line counts. A click on a
 * row scrolls to its file.
 */
const FileList = ({
  files,
  draft,
  layout,
  onLayout,
  onJump,
}: {
  files: readonly FileDiff[];
  draft: ReviewDraft;
  layout: DiffLayout;
  onLayout: (layout: DiffLayout) => void;
  onJump: (index: number) => void;
}) => (
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
              <button
                type="button"
                onClick={() => onJump(index)}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">{`${words}: `}</span>
                <FilePath path={file.path} className="flex-1 text-xs" />
                {comments > 0 && (
                  <span className="flex shrink-0 items-center gap-1 font-medium text-primary text-xs">
                    <MessageSquare aria-hidden="true" className="size-3.5" />
                    {comments}
                    <span className="sr-only">{comments === 1 ? ' comment' : ' comments'}</span>
                  </span>
                )}
                <LineCounts additions={file.additions} deletions={file.deletions} />
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  </nav>
);

/**
 * The overall comment of the review, which no line anchors, in a field below the diff.
 */
const OverallComment = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-medium text-sm">
      <label htmlFor="review-overall">Overall comment</label>
    </h2>
    <Textarea
      id="review-overall"
      placeholder="Write what applies to the whole change"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-24 bg-background"
    />
  </section>
);

/**
 * The line where the changes of the ticket stand while they cannot show: while they load, once the read failed, or
 * once no commit holds them.
 */
const ChangesNotice = ({ changes, landed }: { changes: Changes; landed: boolean }) => {
  if (!landed)
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
        The work of this ticket has not landed yet. Its review opens once it needs review.
      </p>
    );
  if (changes.state === 'loading') return <p className="text-muted-foreground text-sm">Reading the changes</p>;
  if (changes.state === 'failed')
    return (
      <p role="alert" className="text-destructive text-sm">
        {`The changes cannot be read: ${changes.message}`}
      </p>
    );
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
      No commit holds the work of this ticket. It changed nothing, or it landed before commits named their ticket. You
      can still leave an overall comment.
    </p>
  );
};

/**
 * The review of the ticket `ticket` of the task `task`, as a page of its changes: the list of the changed files at the
 * top, then the diff of each file, then a field for the overall comment, with the bar of the actions at the bottom. A
 * click on a line number selects that line to comment on, and a shift and a click extend the selection. Each file
 * takes comments on the whole file too, such as for a file that was only moved. The comments stay in the local storage
 * of the browser until they are sent. `Request changes` adds a ticket that makes the changes that the comments ask
 * for, approves this ticket when it needs review, and opens the new ticket. `Approve` discards the comments and
 * approves this ticket. When the landing of the task stops on a conflict, the orchestrator of the task takes over, and
 * `onOpenChat` opens its chat.
 */
export const ReviewPage = ({
  task,
  ticket,
  onOpenChat,
}: {
  task: TaskSummary;
  ticket: Ticket;
  onOpenChat: (sessionId: string) => void;
}) => {
  const landed = ticket.status === 'needs-review' || ticket.status === 'done';
  const changes = useChanges(task.id, ticket.id, landed);
  const [draft, update] = useReviewDraft(task.id, ticket.id);
  const [layout, setLayout] = useDiffLayout();
  const [selection, setSelection] = useState<Selection>();
  const [editing, setEditing] = useState<string>();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [action, setAction] = useState<'approving' | 'requesting'>();
  const [failure, setFailure] = useState<string>();
  const [created, setCreated] = useState<{ ticket: Ticket; refusal: string }>();
  const files = changes.state === 'loaded' ? changes.files : [];
  const count = commentCountOf(draft);

  /**
   * Returns the comments of `draft` and the selection on the file `path`, with what changes them.
   */
  const reviewOf = (path: string): FileReview => ({
    comments: draft.comments.filter((comment) => comment.path === path),
    selection: selection?.path === path ? selection.anchor : undefined,
    editing,
    onSelectLine: (side: DiffSide, number: number, extend: boolean) => {
      setEditing(undefined);
      setSelection((current) => {
        const origin = current?.origin;
        if (extend && current?.path === path && current.anchor.kind === 'lines' && current.anchor.side === side) {
          const from = origin ?? number;
          return {
            ...current,
            anchor: { ...current.anchor, start: Math.min(from, number), end: Math.max(from, number) },
          };
        }
        return { path, origin: number, anchor: { kind: 'lines', side, start: number, end: number } };
      });
    },
    onSelectFile: () => {
      setEditing(undefined);
      setCollapsed((current) => new Set([...current].filter((other) => other !== path)));
      setSelection({ path, origin: null, anchor: { kind: 'file' } });
    },
    onAdd: (body: string) => {
      if (selection === undefined) return;
      const comment = { id: newCommentId(), path, anchor: selection.anchor, body };
      update((current) => ({ ...current, comments: [...current.comments, comment] }));
      setSelection(undefined);
    },
    onCancel: () => {
      setSelection(undefined);
      setEditing(undefined);
    },
    onEdit: (id: string) => {
      setSelection(undefined);
      setEditing(id);
    },
    onSave: (id: string, body: string) => {
      update((current) => ({
        ...current,
        comments: current.comments.map((comment) => (comment.id === id ? { ...comment, body } : comment)),
      }));
      setEditing(undefined);
    },
    onDelete: (id: string) =>
      update((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== id) })),
  });

  /**
   * Shows the file at `index` if it is folded, and scrolls to it.
   */
  const jumpTo = (index: number) => {
    const path = files[index]?.path;
    setCollapsed((current) => new Set([...current].filter((other) => other !== path)));
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(fileIdOf(index))?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  };

  /**
   * Folds the file `path` when it shows, and shows it when it is folded.
   */
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  /**
   * Runs the action `name` with `run`, and keeps the message of its failure.
   */
  const runAction = async (name: 'approving' | 'requesting', run: () => Promise<void>) => {
    setAction(name);
    setFailure(undefined);
    try {
      await run();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(undefined);
    }
  };

  /**
   * Discards the comments and approves the ticket, then opens the chat of the orchestrator of the task when it took
   * over the landing of the task.
   */
  const approve = () =>
    runAction('approving', async () => {
      const orchestrator = await approveTicket(task.id, ticket.id);
      update(() => EMPTY_DRAFT);
      setSelection(undefined);
      setEditing(undefined);
      if (orchestrator !== undefined) onOpenChat(orchestrator);
    });

  /**
   * Sends the comments as a new ticket, which approves this ticket, then opens the new ticket, or shows why this ticket
   * was not approved.
   */
  const requestChanges = () =>
    runAction('requesting', async () => {
      const commit = changes.state === 'loaded' ? changes.commit : null;
      const review = reviewMarkdown(draft, files, commit);
      const result = await call<RequestedChanges>('ticketRequestChanges', {
        taskId: task.id,
        ticketId: ticket.id,
        review,
      });
      update(() => EMPTY_DRAFT);
      setSelection(undefined);
      setEditing(undefined);
      if (result.approvalRefusal === null) {
        navigate(ticketPath(taskRefOf(task), ticketRefOf(result.ticket), 'summary'));
      } else {
        setCreated({ ticket: result.ticket, refusal: result.approvalRefusal });
      }
    });

  const headline =
    changes.state === 'loaded'
      ? `Commit ${changes.commit.slice(0, 7)}, ${counted(changes.files.length, 'file', 'files')} changed`
      : undefined;
  const busy = action !== undefined;

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
                    review={reviewOf(file.path)}
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
      {landed && (
        <div className="border-t bg-background">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
            <div role="status" className="min-w-0 flex-1 text-sm">
              {failure !== undefined ? (
                <span className="text-destructive">{failure}</span>
              ) : created !== undefined ? (
                <span>
                  {'Added ticket '}
                  <RouteLink
                    to={ticketPath(taskRefOf(task), ticketRefOf(created.ticket), 'summary')}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {`#${created.ticket.id} ${created.ticket.slug}`}
                  </RouteLink>
                  {`. This ticket is not approved: ${created.refusal}`}
                </span>
              ) : count === 0 ? (
                <span className="text-muted-foreground">No comments yet. Click a line number to comment on it.</span>
              ) : (
                <span>
                  <span className="font-medium">{counted(count, 'comment', 'comments')}</span>
                  {ticket.status === 'needs-review' && (
                    <span className="text-muted-foreground">. Approve discards them.</span>
                  )}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" disabled={busy || isEmptyDraft(draft)} onClick={() => void requestChanges()}>
                {action === 'requesting' ? 'Requesting changes' : 'Request changes'}
              </Button>
              <Button disabled={busy || ticket.status !== 'needs-review'} onClick={() => void approve()}>
                {ticket.status === 'done' ? 'Approved' : action === 'approving' ? 'Approving' : 'Approve'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
