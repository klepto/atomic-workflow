import { z } from 'zod';
import type { Task, Ticket, TicketMode, TicketStatus } from '../storage/task-store.ts';
import type { Method, MethodContext } from './method.ts';
import { callHolder, hasLanded, openCompleteTask, pendingDependencies } from './open-ticket.ts';

/**
 * Schema of the parameters of `ticketNext`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
});

/**
 * Causes that keep a ticket whose work has not landed from being picked: `elsewhere` while another session holds it,
 * `blocked` while it waits for the cause that its reason names, and `dependencies` while a ticket that it depends on
 * has not landed.
 */
const WAIT_CAUSES = ['elsewhere', 'blocked', 'dependencies'] as const;

/**
 * Cause that keeps a ticket from being picked, one of `WAIT_CAUSES`.
 */
type WaitCause = (typeof WAIT_CAUSES)[number];

/**
 * Ticket that can be picked: it is ready, and not `blocked`.
 */
interface PickableTicket {
  /**
   * Identifier of the ticket within its task.
   */
  readonly id: number;

  /**
   * Short name of the ticket in kebab case.
   */
  readonly slug: string;

  /**
   * Status of the ticket: `in-progress` or `not-started`.
   */
  readonly status: TicketStatus;

  /**
   * Who does the work of the ticket.
   */
  readonly mode: TicketMode;
}

/**
 * Ticket whose work has not landed, and that cannot be picked.
 */
interface WaitingTicket {
  /**
   * Identifier of the ticket within its task.
   */
  readonly id: number;

  /**
   * Short name of the ticket in kebab case.
   */
  readonly slug: string;

  /**
   * Status of the ticket.
   */
  readonly status: TicketStatus;

  /**
   * Cause that keeps the ticket from being picked.
   */
  readonly cause: WaitCause;

  /**
   * Cause that a blocked ticket waits for, or `null` for a ticket that is not blocked.
   */
  readonly blockedReason: string | null;

  /**
   * Identifiers of the tickets that the ticket depends on and whose work has not landed, empty for none.
   */
  readonly pendingDependencies: readonly number[];
}

/**
 * Result of `ticketNext`.
 */
interface TicketNextResult {
  /**
   * Next ticket to work on, or `null` when no ticket can be picked.
   */
  readonly ticket: Ticket | null;

  /**
   * Every ticket that can be picked, the next ticket among them, in the order of their identifiers. It is empty when
   * no ticket can be picked.
   */
  readonly pickable: readonly PickableTicket[];

  /**
   * Tickets whose work has not landed and that cannot be picked, each with its cause, in the order of their
   * identifiers. It is empty when every ticket that cannot be picked landed.
   */
  readonly waiting: readonly WaitingTicket[];
}

/**
 * `Method` named `ticketNext`, which returns the next ticket to work on of a task whose plan is complete, with each
 * ticket that cannot be picked. A ticket is ready when its work has not landed, every ticket that it depends on has
 * landed, and no other session holds it. A ready ticket that is `blocked` waits for the user, so it is picked only when
 * the user names it. The next ticket is the first ready ticket that is `in-progress`, since its work sits in a worktree
 * already, or else the first ready ticket that is `not-started`. Every ticket that can be picked comes with it, so a
 * caller can work on several at once. A task that does not exist fails with invalid parameters. A task whose plan is
 * not complete, and a task that is done, fail with an invalid request.
 */
export const ticketNextMethod: Method<typeof PARAMS, TicketNextResult> = {
  name: 'ticketNext',
  description:
    'Returns the next ticket to work on of a task of the atomic workflow whose plan is complete: the first ready ticket in progress, else the first ready ticket not started, or null. Also returns every ticket that can be picked, with its mode, and each ticket whose work has not landed and that cannot be picked, with its cause: elsewhere, blocked or dependencies.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId }, context) => {
    const task = await openCompleteTask(taskId, context);
    const open = task.tickets.filter(({ status }) => !hasLanded(status));
    const pickable = open.filter((ticket) => ticket.status !== 'blocked' && isReady(task, ticket, context));
    const ticket =
      pickable.find(({ status }) => status === 'in-progress') ??
      pickable.find(({ status }) => status === 'not-started') ??
      null;
    const waiting = open
      .filter((other) => !pickable.includes(other))
      .map((other) => waitingTicket(task, other, context));
    return { ticket, pickable: pickable.map(pickableTicket), waiting };
  },
};

/**
 * Returns whether `ticket` of `task` is ready for the caller of `context`: every ticket that it depends on has landed,
 * and no other session holds it.
 */
const isReady = (task: Task, ticket: Ticket, context: MethodContext): boolean =>
  pendingDependencies(task, ticket).length === 0 && !isElsewhere(task, ticket, context);

/**
 * Returns `ticket`, which can be picked, as a ticket that the caller can work on, with its mode.
 */
const pickableTicket = ({ id, slug, status, mode }: Ticket): PickableTicket => ({ id, slug, status, mode });

/**
 * Returns `ticket` of `task`, which cannot be picked, as a ticket that waits for the caller of `context`, with its
 * cause.
 */
const waitingTicket = (task: Task, ticket: Ticket, context: MethodContext): WaitingTicket => {
  const { id, slug, status, blockedReason } = ticket;
  const pending = pendingDependencies(task, ticket);
  return { id, slug, status, cause: causeOf(task, ticket, context), blockedReason, pendingDependencies: pending };
};

/**
 * Returns the cause that keeps `ticket` of `task`, which cannot be picked, from being picked for the caller of
 * `context`. A ticket that another session holds is `elsewhere` before anything else.
 */
const causeOf = (task: Task, ticket: Ticket, context: MethodContext): WaitCause => {
  if (isElsewhere(task, ticket, context)) return 'elsewhere';
  if (ticket.status === 'blocked') return 'blocked';
  return 'dependencies';
};

/**
 * Returns whether a session other than the caller of `context` holds `ticket` of `task`.
 */
const isElsewhere = (task: Task, ticket: Ticket, context: MethodContext): boolean =>
  context.ticketClaims.isHeldByOther(task.id, ticket.id, callHolder(context));
