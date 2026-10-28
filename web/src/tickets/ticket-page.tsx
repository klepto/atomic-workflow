import { type ReactNode, useEffect } from 'react';
import type { TaskSummary, Ticket } from '@/api/types.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { cn } from '@/lib/utils.ts';
import { ReviewPage } from '@/review/review-page.tsx';
import { navigate } from '@/routing/navigation.ts';
import { RouteLink } from '@/routing/route-link.tsx';
import { findTicket, type TicketView, taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { STATUS_WORDS } from '@/tasks/ticket-list.tsx';
import { useTickets } from '@/tasks/use-tickets.ts';

/**
 * The views of a ticket in the order of their tabs, each with its label.
 */
const VIEWS: readonly { view: TicketView; label: string }[] = [
  { view: 'summary', label: 'Summary' },
  { view: 'review', label: 'Review' },
];

/**
 * The tabs of the views of the ticket `ticket` of the task `task`, which float at the top of the page above its
 * content. The tab of the view `current` is marked.
 */
const ViewTabs = ({ task, ticket, current }: { task: TaskSummary; ticket: Ticket; current: TicketView }) => (
  <nav aria-label="Ticket views" className="-translate-x-1/2 pointer-events-none absolute top-3 left-1/2 z-20">
    <div className="pointer-events-auto flex gap-0.5 rounded-full border bg-background/85 p-1 shadow-md backdrop-blur-sm">
      {VIEWS.map(({ view, label }) => (
        <RouteLink
          key={view}
          to={ticketPath(taskRefOf(task), ticketRefOf(ticket), view)}
          aria-current={view === current ? 'page' : undefined}
          className={cn(
            'rounded-full px-4 py-1 font-medium text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none',
            view === current
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {label}
        </RouteLink>
      ))}
    </div>
  </nav>
);

/**
 * The words of each mode of a ticket.
 */
const MODE_WORDS: Record<Ticket['mode'], string> = {
  unattended: 'Unattended, an agent works alone',
  attended: 'Attended, an agent works with you',
  manual: 'Manual, you do the work',
};

/**
 * Links to each ticket of `ids` among `tickets`, by its id and its slug, separated by commas.
 */
const TicketLinks = ({
  task,
  tickets,
  ids,
}: {
  task: TaskSummary;
  tickets: readonly Ticket[];
  ids: readonly number[];
}) =>
  ids.map((id, index) => {
    const ticket = tickets.find((candidate) => candidate.id === id);
    return (
      <span key={id}>
        {index > 0 && ', '}
        {ticket === undefined ? (
          `#${id}`
        ) : (
          <RouteLink
            to={ticketPath(taskRefOf(task), ticketRefOf(ticket), 'summary')}
            className="text-primary underline-offset-4 hover:underline"
          >
            {`#${ticket.id} ${ticket.slug}`}
          </RouteLink>
        )}
      </span>
    );
  });

/**
 * The summary of the ticket `ticket` of the task `task`: its id, its slug and its summary, its status with the reason
 * when it is blocked, the facts of its work, the tickets it depends on and the ticket it fixes, each a link among
 * `tickets`, and below them its description.
 */
const TicketSummary = ({
  task,
  ticket,
  tickets,
}: {
  task: TaskSummary;
  ticket: Ticket;
  tickets: readonly Ticket[];
}) => {
  const facts: { term: string; value: ReactNode }[] = [
    {
      term: 'Status',
      value: ticket.stage === null ? STATUS_WORDS[ticket.status] : `${STATUS_WORDS[ticket.status]}, ${ticket.stage}`,
    },
    { term: 'Mode', value: MODE_WORDS[ticket.mode] },
    { term: 'Work', value: ticket.complexity === null ? ticket.type : `${ticket.type}, ${ticket.complexity}` },
  ];
  if (ticket.dependsOn.length > 0)
    facts.push({ term: 'Depends on', value: <TicketLinks task={task} tickets={tickets} ids={ticket.dependsOn} /> });
  if (ticket.fixes !== null)
    facts.push({ term: 'Fixes', value: <TicketLinks task={task} tickets={tickets} ids={[ticket.fixes]} /> });
  return (
    <ScrollArea className="flex-1">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-20 pb-12 md:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="min-w-0 break-words font-semibold text-2xl tracking-tight">
            <span className="mr-2 font-normal text-muted-foreground tabular-nums">{`#${ticket.id}`}</span>
            {ticket.slug}
          </h1>
          <p className="text-base leading-7">{ticket.summary}</p>
        </header>
        {ticket.blockedReason !== null && (
          <p role="status" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
            <span className="font-medium text-destructive">Blocked. </span>
            {ticket.blockedReason}
          </p>
        )}
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-8 gap-y-2 text-sm">
          {facts.map(({ term, value }) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section aria-label="Description" className="border-t pt-8">
          <MarkdownBody text={ticket.description} className="leading-7" />
        </section>
      </article>
    </ScrollArea>
  );
};

/**
 * The page of the ticket that `ticketRef` names among the tickets of the task `task`, in the area of the chat: the
 * tabs `Summary` and `Review` float at its top, above the view `view`. Once the ticket is found, the URL takes its
 * canonical ref, with no new history entry. A ref that names no ticket of the task says so. The review hands the
 * session id of the orchestrator of the task to `onOpenChat` when it takes over the landing of the task.
 */
export const TicketPage = ({
  task,
  ticketRef,
  view,
  onOpenChat,
}: {
  task: TaskSummary;
  ticketRef: string;
  view: TicketView;
  onOpenChat: (sessionId: string) => void;
}) => {
  const tickets = useTickets(task);
  const ticket = tickets === undefined ? undefined : findTicket(tickets, ticketRef);
  const canonical = ticket === undefined ? undefined : ticketPath(taskRefOf(task), ticketRefOf(ticket), view);
  useEffect(() => {
    if (canonical !== undefined && canonical !== window.location.pathname) navigate(canonical, { replace: true });
  }, [canonical]);

  if (tickets === undefined) return <div className="flex-1" />;
  if (ticket === undefined)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="font-medium text-lg">{`Task ${task.slug} has no ticket ${ticketRef}`}</p>
        <p className="text-muted-foreground text-sm">Open a ticket from the list in the task panel.</p>
      </div>
    );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ViewTabs task={task} ticket={ticket} current={view} />
      {view === 'summary' ? (
        <TicketSummary task={task} ticket={ticket} tickets={tickets} />
      ) : (
        <ReviewPage key={ticket.id} task={task} ticket={ticket} onOpenChat={onOpenChat} />
      )}
    </div>
  );
};
