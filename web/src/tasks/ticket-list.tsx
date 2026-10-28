import { useState } from 'react';
import type { TaskSummary, Ticket } from '@/api/types.ts';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { RouteLink } from '@/routing/route-link.tsx';
import { taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { approveTicket } from '@/tasks/approve-ticket.ts';
import { useTickets } from '@/tasks/use-tickets.ts';

/**
 * The words that the list names each status of a ticket by.
 */
export const STATUS_WORDS: Record<Ticket['status'], string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'needs-review': 'Needs review',
  blocked: 'Blocked',
  done: 'Done',
};

/**
 * The row of the ticket `ticket` of the task `task`: its id, its slug and its status, with the buttons `Review` and
 * `Approve` on the right. The slug links to the summary of the ticket, and `Review` to its review, which it offers
 * once the work of the ticket landed. `Approve` is enabled only while the ticket needs review and `busy` is false, and
 * calls `onApprove`. It reads `Approving` while `approving` is true. The full summary of the ticket shows on hover.
 */
const TicketRow = ({
  task,
  ticket,
  approving,
  busy,
  onApprove,
}: {
  task: TaskSummary;
  ticket: Ticket;
  approving: boolean;
  busy: boolean;
  onApprove: () => void;
}) => (
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
      {ticket.status === 'needs-review' || ticket.status === 'done' ? (
        <RouteLink
          to={ticketPath(taskRefOf(task), ticketRefOf(ticket), 'review')}
          aria-label={`Review ticket ${ticket.id}, ${ticket.slug}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Review
        </RouteLink>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Review
        </Button>
      )}
      <Button
        size="sm"
        disabled={ticket.status !== 'needs-review' || busy}
        aria-label={`Approve ticket ${ticket.id}, ${ticket.slug}`}
        onClick={onApprove}
      >
        {approving ? 'Approving' : 'Approve'}
      </Button>
    </div>
  </li>
);

/**
 * The tickets of the task `task` in the order of their ids, each in a row with its buttons `Review` and `Approve`.
 * One approval runs at a time. When the server refuses one, the list shows why below the rows. When the landing of the
 * task stops on a conflict, the orchestrator of the task takes over, and `onOpenChat` opens its chat.
 */
export const TicketList = ({ task, onOpenChat }: { task: TaskSummary; onOpenChat: (sessionId: string) => void }) => {
  const tickets = useTickets(task);
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
      setFailure(error instanceof Error ? error.message : String(error));
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
