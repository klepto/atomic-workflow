import type { TaskSummary, Ticket } from '@/api/types.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { counted } from '@/review/counted.ts';
import { commentCountOf, isEmptyDraft, type ReviewDraft } from '@/review/review-draft.ts';
import type { ActionFailure, ReviewAction, ReviewActions } from '@/review/use-review-actions.ts';
import { taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { RouteLink } from '@/routing/route-link.tsx';

/**
 * Props of `ReviewActionBar` and of its status line `ReviewStatus`.
 */
interface ReviewActionBarProps {
  /**
   * Task of the reviewed ticket.
   */
  readonly task: TaskSummary;

  /**
   * Reviewed ticket.
   */
  readonly ticket: Ticket;

  /**
   * Review that the user wrote.
   */
  readonly draft: ReviewDraft;

  /**
   * Actions of the review with their state.
   */
  readonly actions: ReviewActions;
}

/**
 * Returns the second line of the hint of the button of the action `action`: the message of `failure` when the latest
 * click of that action failed, else the first of `reasons` that is not `false`, which says why the button is disabled.
 * Returns `undefined` when there is neither.
 */
const actionNoteOf = (
  action: ReviewAction,
  failure: ActionFailure | undefined,
  reasons: readonly (string | false)[],
): string | undefined => (failure?.action === action ? failure.message : reasons.find((reason) => reason !== false));

/**
 * Line of the bar that says how the review stands: the failure of the latest action, the ticket that a request of
 * changes added while this ticket was not approved, or the number of the comments.
 */
const ReviewStatus = ({ task, ticket, draft, actions }: ReviewActionBarProps) => {
  const count = commentCountOf(draft);
  if (actions.failure !== undefined) return <span className="text-destructive">{actions.failure.message}</span>;
  if (actions.created !== undefined) {
    const { ticket: created, refusal } = actions.created;
    return (
      <span>
        {'Added ticket '}
        <RouteLink
          to={ticketPath(taskRefOf(task), ticketRefOf(created), 'summary')}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {`#${created.id} ${created.slug}`}
        </RouteLink>
        {`. This ticket is not approved: ${refusal}`}
      </span>
    );
  }
  if (count === 0) {
    return <span className="text-muted-foreground">No comments yet. Click a line number to comment on it.</span>;
  }
  return (
    <span>
      <span className="font-medium">{counted(count, 'comment', 'comments')}</span>
      {ticket.status === 'needs-review' && <span className="text-muted-foreground">. Approve discards them.</span>}
    </span>
  );
};

/**
 * Bar at the bottom of the review of the ticket `ticket` of the task `task`: how the review stands, and the buttons
 * `Request changes` and `Approve`, each with a hint that says why it is disabled, or why its latest click failed.
 */
export const ReviewActionBar = ({ task, ticket, draft, actions }: ReviewActionBarProps) => {
  const { action, failure } = actions;
  const busy = action !== undefined;
  const busyReason =
    action === 'approving' ? `Ticket ${ticket.id} is being approved` : 'The changes are being requested';
  const empty = isEmptyDraft(draft);
  return (
    <div className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
        <div role="status" className="min-w-0 flex-1 text-sm">
          <ReviewStatus task={task} ticket={ticket} draft={draft} actions={actions} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Hint
            description={`Send the comments as a new ticket that fixes ticket ${ticket.id}`}
            note={actionNoteOf('requesting', failure, [busy && busyReason, empty && 'Add a comment first'])}
          >
            <Button variant="outline" disabled={busy || empty} onClick={() => void actions.requestChanges()}>
              {action === 'requesting' ? 'Requesting changes' : 'Request changes'}
            </Button>
          </Hint>
          <Hint
            description={`Approve ticket ${ticket.id} and set it done`}
            note={actionNoteOf('approving', failure, [
              busy && busyReason,
              ticket.status === 'done' && `Ticket ${ticket.id} is approved already`,
            ])}
          >
            <Button disabled={busy || ticket.status !== 'needs-review'} onClick={() => void actions.approve()}>
              {ticket.status === 'done' ? 'Approved' : action === 'approving' ? 'Approving' : 'Approve'}
            </Button>
          </Hint>
        </div>
      </div>
    </div>
  );
};
