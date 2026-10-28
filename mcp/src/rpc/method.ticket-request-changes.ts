import { z } from 'zod';
import type { Task, Ticket } from '../storage/task-store.ts';
import type { Method, MethodContext } from './method.ts';
import { taskGetMethod } from './method.task-get.ts';
import { ticketSetStatusMethod } from './method.ticket-set-status.ts';
import { ticketsSaveMethod } from './method.tickets-save.ts';
import { hasLanded } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Schema of the parameters of `ticketRequestChanges`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  ticketId: z.number().int().positive().describe('Identifier of the reviewed ticket within its task'),
  review: z
    .string()
    .trim()
    .min(1)
    .describe('Comments of the review in Markdown, each with the file and the lines that it points at'),
});

/**
 * Result of `ticketRequestChanges`.
 */
export interface RequestedChanges {
  /**
   * New ticket that makes the changes that the review asked for.
   */
  readonly ticket: Ticket;

  /**
   * Why the server refused to approve the reviewed ticket, or `null` when it approved it, or when it was done already.
   */
  readonly approvalRefusal: string | null;
}

/**
 * Heading of the section of the description of a ticket that names the commands that check its work.
 */
const VERIFY_HEADING = '## Verify';

/**
 * `Method` named `ticketRequestChanges`, which adds a ticket at the end of the tickets of a task that makes the changes
 * that the review of a landed ticket asked for, then approves the reviewed ticket when it needs review. The new ticket
 * has the mode, the type and the complexity of the reviewed ticket, depends on it, and holds the review in its
 * description, with the section `## Verify` of the reviewed ticket. A done task opens again: it becomes complete, and
 * lands again once every ticket is done. A task or a ticket that does not exist, and a review without text, fail with
 * invalid parameters. A task whose plan is not complete, a ticket whose work has not landed, and every refusal of
 * `ticketsSave`, fail with an invalid request. A refusal of the approval does not fail the call: the result holds it.
 */
export const ticketRequestChangesMethod: Method<typeof PARAMS, RequestedChanges> = {
  name: 'ticketRequestChanges',
  description:
    'Adds a ticket that makes the changes that the review of a landed ticket of the atomic workflow asked for, and approves the reviewed ticket.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, ticketId, review }, context) => {
    const task = await taskGetMethod.handle({ task: taskId }, context);
    const reviewed = reviewedTicketOf(task, ticketId);
    const saved = await saveReopened(task, [...task.tickets, followUpOf(task, reviewed, review)], context);
    const ticket = saved.tickets[saved.tickets.length - 1] as Ticket;
    if (reviewed.status !== 'needs-review') return { ticket, approvalRefusal: null };
    try {
      await ticketSetStatusMethod.handle({ taskId, ticketId, status: 'done' }, context);
      return { ticket, approvalRefusal: null };
    } catch (error) {
      return { ticket, approvalRefusal: error instanceof Error ? error.message : String(error) };
    }
  },
};

/**
 * Returns the ticket `ticketId` of `task`, whose work landed and can take a review. A ticket that does not exist fails
 * with invalid parameters. A task whose plan is not complete, and a ticket whose work has not landed, fail with an
 * invalid request.
 */
const reviewedTicketOf = (task: Task, ticketId: number): Ticket => {
  if (task.status !== 'complete' && task.status !== 'done')
    throw new RpcError(RpcErrorCode.INVALID_REQUEST, `The plan of task ${task.id} is not complete. Complete it first`);
  const ticket = task.tickets.find(({ id }) => id === ticketId);
  if (ticket === undefined)
    throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Task ${task.id} has no ticket ${ticketId}`);
  if (!hasLanded(ticket.status))
    throw new RpcError(
      RpcErrorCode.INVALID_REQUEST,
      `Ticket ${ticketId} is ${ticket.status}, so its work has not landed and cannot take a review`,
    );
  return ticket;
};

/**
 * Returns the ticket that makes the changes that the review `review` of the ticket `reviewed` of `task` asked for, as
 * the next ticket of `task`.
 */
const followUpOf = (task: Task, reviewed: Ticket, review: string): Ticket => {
  const id = task.tickets.length + 1;
  const name = `${reviewed.id}-${reviewed.slug}`;
  const verify = sectionOf(reviewed.description, VERIFY_HEADING);
  const description = [
    `Follow-up of ticket ${name}: ${reviewed.summary}`,
    `The review of its landed work asked for the changes below. Each comment names the file and the lines of the commit of ticket ${name} that it points at.`,
    `## Review\n\n${review}`,
    '## Acceptance criteria\n\n- Each comment of `## Review` is addressed.',
    ...(verify === undefined ? [] : [verify]),
  ].join('\n\n');
  return {
    ...reviewed,
    id,
    slug: `review-fixes-${id}`,
    summary: `Make the changes that the review of ticket ${name} asked for.`,
    description,
    dependsOn: [reviewed.id],
    fixes: null,
    status: 'not-started',
    stage: null,
    blockedReason: null,
  };
};

/**
 * Returns the section of the Markdown `markdown` that starts at the heading line `heading`, up to the next heading of
 * the same level, or `undefined` when it has none.
 */
const sectionOf = (markdown: string, heading: string): string | undefined => {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines
    .slice(start, end === -1 ? undefined : end)
    .join('\n')
    .trim();
};

/**
 * Returns `task` after its tickets became `tickets`, with the services of `context`. A done task becomes complete
 * first, so its tickets can change, and becomes done again when the save fails.
 */
const saveReopened = async (task: Task, tickets: readonly Ticket[], context: MethodContext): Promise<Task> => {
  const reopened = task.status === 'done';
  if (reopened) await context.tasks.setStatus(task.id, 'complete');
  try {
    const params = tickets.map((ticket) => ({ ...ticket, dependsOn: [...ticket.dependsOn] }));
    return await ticketsSaveMethod.handle({ taskId: task.id, tickets: params }, context);
  } catch (error) {
    if (reopened) await context.tasks.setStatus(task.id, 'done');
    throw error;
  }
};
