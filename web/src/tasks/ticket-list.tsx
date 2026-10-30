import { useState } from 'react';
import type { TaskSummary, Ticket } from '@/api/types.ts';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { errorMessage } from '@/lib/error-message.ts';
import { cn } from '@/lib/utils.ts';
import { taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { RouteLink, type RouteLinkProps } from '@/routing/route-link.tsx';
import { approveTicket } from '@/tasks/approve-ticket.ts';
import { useTaskDetail } from '@/tasks/use-task-detail.ts';
import { STATUS_WORDS } from '@/tickets/status-words.ts';

/**
 * Note of the hint of a button that is disabled until the work of its ticket landed.
 */
const NOT_LANDED = 'The work of the ticket has not landed yet';

/**
 * Props of `HintLink`: the props of a `RouteLink`, and the prop that a hint sets on the button that it describes.
 */
interface HintLinkProps extends RouteLinkProps {
  /**
   * Whether the button stays focusable while disabled, which a link, never disabled, drops.
   */
  readonly focusableWhenDisabled?: boolean;
}

/**
 * Props of `TicketRow`.
 */
interface TicketRowProps {
  /**
   * Task of the ticket.
   */
  readonly task: TaskSummary;

  /**
   * Ticket that the row shows.
   */
  readonly ticket: Ticket;

  /**
   * Whether the approval of this ticket runs.
   */
  readonly approving: boolean;

  /**
   * Whether an approval of any ticket of the list runs.
   */
  readonly busy: boolean;

  /**
   * Approves the ticket.
   */
  readonly onApprove: () => void;
}

/**
 * Props of `TicketList`.
 */
interface TicketListProps {
  /**
   * Task whose tickets the list shows.
   */
  readonly task: TaskSummary;

  /**
   * Opens the chat of the subagent `sessionId` beside the task, such as the orchestrator of the task once it took over
   * an approval.
   */
  readonly onOpenChat: (sessionId: string) => void;
}

/**
 * Returns whether the work of the ticket `ticket` landed on the task branch, so that it can be reviewed.
 */
const landed = (ticket: Ticket): boolean => ticket.status === 'needs-review' || ticket.status === 'done';

/**
 * Returns why the button `Approve` of the ticket `ticket` is disabled, or `undefined` while it is enabled: the ticket
 * is approved already, its work has not landed, or an approval runs, of this ticket while `approving` is true, or of
 * another one while `busy` is true.
 */
const approveDisabledReason = (ticket: Ticket, approving: boolean, busy: boolean): string | undefined => {
  if (ticket.status === 'done') return 'The ticket is approved already';
  if (ticket.status !== 'needs-review') return NOT_LANDED;
  if (approving) return 'The approval is running';
  return busy ? 'Another approval is running' : undefined;
};

/**
 * `RouteLink` that a hint can describe. A hint makes its button focusable while disabled with the prop
 * `focusableWhenDisabled`, which a link, never disabled, drops instead of passing it to its anchor.
 */
const HintLink = ({ focusableWhenDisabled: _, ...props }: HintLinkProps) => <RouteLink {...props} />;

/**
 * Row of the ticket `ticket` of the task `task`: its id, its slug and its status, with the buttons `Review` and
 * `Approve` on the right, each with a hint that says what it does, and why while it is disabled. The slug links to the
 * summary of the ticket, and `Review` to its review, which it offers once the work of the ticket landed. `Approve` is
 * enabled only while the ticket needs review and `busy` is false, and calls `onApprove`. It reads `Approving` while
 * `approving` is true. The full summary of the ticket shows on hover.
 */
const TicketRow = ({ task, ticket, approving, busy, onApprove }: TicketRowProps) => (
  <li className="flex items-center gap-3 py-2.5">
    <div title={ticket.summary} className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="truncate font-medium text-sm">
        <RouteLink
          to={ticketPath(taskRefOf(task), ticketRefOf(ticket), 'summary')}
          className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="mr-1.5 font-normal text-muted-foreground tabular-nums">{`#${ticket.id}`}</span>
          {ticket.slug}
        </RouteLink>
      </p>
      <p
        className={cn(
          'text-xs',
          ticket.status === 'needs-review' ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {STATUS_WORDS[ticket.status]}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      {landed(ticket) ? (
        <Hint description={`Review the work of ticket ${ticket.id}`}>
          <HintLink
            to={ticketPath(taskRefOf(task), ticketRefOf(ticket), 'review')}
            aria-label={`Review ticket ${ticket.id}, ${ticket.slug}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Review
          </HintLink>
        </Hint>
      ) : (
        <Hint description={`Review the work of ticket ${ticket.id}`} note={NOT_LANDED}>
          <Button variant="outline" size="sm" disabled>
            Review
          </Button>
        </Hint>
      )}
      <Hint
        description={`Approve ticket ${ticket.id} and set it done`}
        note={approveDisabledReason(ticket, approving, busy)}
      >
        <Button
          size="sm"
          disabled={ticket.status !== 'needs-review' || busy}
          aria-label={`Approve ticket ${ticket.id}, ${ticket.slug}`}
          onClick={onApprove}
        >
          {approving ? 'Approving' : 'Approve'}
        </Button>
      </Hint>
    </div>
  </li>
);

/**
 * Tickets of the task `task` in the order of their ids, each in a row with its buttons `Review` and `Approve`. One
 * approval runs at a time. When the server refuses one, the list shows why below the rows. When the landing of the
 * task stops on a conflict, the orchestrator of the task takes over, and `onOpenChat` opens its chat.
 */
export const TicketList = ({ task, onOpenChat }: TicketListProps) => {
  const tickets = useTaskDetail(task)?.tickets;
  const [approving, setApproving] = useState<number>();
  const [failure, setFailure] = useState<string>();

  /**
   * Approves the ticket `ticketId`, opens the chat of the orchestrator of the task when it took over, and keeps the
   * message of a refusal as the failure.
   */
  const approve = async (ticketId: number) => {
    setApproving(ticketId);
    setFailure(undefined);
    try {
      const orchestrator = await approveTicket(task.id, ticketId);
      if (orchestrator !== undefined) {
        onOpenChat(orchestrator);
      }
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setApproving(undefined);
    }
  };

  if (tickets === undefined || tickets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Tickets" className="flex flex-col divide-y">
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            task={task}
            ticket={ticket}
            approving={approving === ticket.id}
            busy={approving !== undefined}
            onApprove={() => void approve(ticket.id)}
          />
        ))}
      </ol>
      {failure !== undefined && (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      )}
    </div>
  );
};
