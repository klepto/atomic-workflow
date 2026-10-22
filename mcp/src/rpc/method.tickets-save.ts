import { z } from 'zod';
import {
  type NewTicket,
  TICKET_COMPLEXITIES,
  TICKET_MODES,
  TICKET_TYPES,
  type Task,
  type Ticket,
} from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openAmendableTask } from './open-task.ts';
import { endWork } from './open-ticket.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { SLUG } from './slug.ts';

/**
 * Schema of the parameters of `ticketsSave`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task'),
  tickets: z
    .array(
      z.object({
        mode: z
          .enum(TICKET_MODES)
          .describe(
            'Who does the work: unattended for an agent alone from start to finish, attended for an agent that needs the user between turns, manual for the user, whom an agent guides and whose work it checks',
          ),
        type: z
          .enum(TICKET_TYPES)
          .describe(
            'How the work runs: code for work that changes the code of the repository, in stages, other for any other work, such as research or moving files, in one pass',
          ),
        complexity: z
          .enum(TICKET_COMPLEXITIES)
          .nullable()
          .default(null)
          .describe(
            'simple for work that follows an existing pattern or makes small decisions inside the design, across one or several files, complex for cross-cutting work, tricky logic or real judgement. null for a manual ticket, and only for one',
          ),
        slug: SLUG.describe('Short name of the ticket: exactly three lowercase words joined by hyphens'),
        summary: z
          .string()
          .trim()
          .min(1)
          .regex(/^[^\r\n]*$/, 'Must be one line')
          .describe('Summary of the ticket in one sentence'),
        description: z
          .string()
          .trim()
          .min(1)
          .describe('Description in Markdown, with everything an agent needs to do the ticket in a fresh context'),
        dependsOn: z
          .array(z.number().int().positive())
          .default([])
          .describe('Numbers of the earlier tickets in this list that must be done first, counted from 1'),
        fixes: z
          .number()
          .int()
          .positive()
          .nullable()
          .default(null)
          .describe(
            'Number of the earlier ticket in this list whose work landed and needs review, and that this follow-up ticket fixes. The ticket then depends on it too. null for a ticket that fixes none',
          ),
      }),
    )
    .min(1)
    .describe(
      'Whole list of tickets in order, which replaces the stored one. Ticket n gets the identifier n. On a complete task, each ticket whose work started stays as stored, with the same number: only a ticket that is not-started may change or go away, and a new ticket goes at the end',
    ),
});

/**
 * Ticket in the parameters of `ticketsSave`.
 */
type TicketParams = z.output<typeof PARAMS>['tickets'][number];

/**
 * `Method` named `ticketsSave`, which replaces the tickets of a task that is not done, numbers them from 1 in their
 * order, and returns the task. A ticket that fixes another one depends on it too. On a complete task, each ticket
 * whose work started must stay as stored, with its identifier, its fields and its dependencies, and keeps its
 * progress. A task that does not exist, a ticket that depends on itself, on a later ticket or on one ticket twice, a
 * ticket that fixes itself or a later ticket, and a ticket with a complexity that does not fit its mode, fail with
 * invalid parameters. A done task, a change of a ticket whose work started, a fix of a ticket that does not need
 * review, and a ticket that another session holds fail with an invalid request.
 */
export const ticketsSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'ticketsSave',
  description:
    'Replaces the tickets of a task of the atomic workflow with a whole new list of them, and returns the task. On a complete task, each ticket whose work started must stay as stored.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, tickets }, context) => {
    const stored = await openAmendableTask(taskId, context);
    checkShape(tickets);
    const saved = tickets.map(withFixDependency);
    // The claims keep each ticket that the list can change from starting, and each ticket that it fixes from its
    // approval, until the list is stored.
    const notStarted = stored.tickets.filter(({ status }) => status === 'not-started').map(({ id }) => id);
    const fixed = saved.flatMap(({ fixes }) => (fixes === null ? [] : [fixes]));
    return endWork(taskId, [...new Set([...notStarted, ...fixed])], context, async () => {
      // The task is read again under the claims, so a change that ran in between is seen.
      const task = await openAmendableTask(taskId, context);
      checkLocked(task, saved);
      checkFixes(task, saved);
      await context.tasks.setTickets(taskId, saved);
      return taskGetMethod.handle({ task: taskId }, context);
    });
  },
};

/**
 * Checks that each ticket of `tickets` depends on earlier tickets only, each once, fixes an earlier ticket only, and
 * has a complexity that fits its mode. A ticket that does not fails with invalid parameters.
 */
const checkShape = (tickets: readonly TicketParams[]): void => {
  const invalid = tickets.findIndex(
    ({ dependsOn }, index) => new Set(dependsOn).size !== dependsOn.length || dependsOn.some((id) => id > index),
  );
  if (invalid !== -1)
    throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Ticket ${invalid + 1} must depend on earlier tickets, each once`);
  const late = tickets.findIndex(({ fixes }, index) => fixes !== null && fixes > index);
  if (late !== -1) throw new RpcError(RpcErrorCode.INVALID_PARAMS, `Ticket ${late + 1} must fix an earlier ticket`);
  const misfit = tickets.findIndex(({ mode, complexity }) => (mode === 'manual') !== (complexity === null));
  if (misfit !== -1)
    throw new RpcError(
      RpcErrorCode.INVALID_PARAMS,
      `Ticket ${misfit + 1} must have a complexity, unless its mode is manual, which has none`,
    );
};

/**
 * Returns `ticket` with the ticket that it fixes among its dependencies, each of them once, in order.
 */
const withFixDependency = (ticket: TicketParams): NewTicket => {
  const dependsOn = ticket.fixes === null ? ticket.dependsOn : [...ticket.dependsOn, ticket.fixes];
  return { ...ticket, dependsOn: [...new Set(dependsOn)].sort((first, second) => first - second) };
};

/**
 * Checks that each ticket of `task` whose work started stays as stored in `tickets`, with its identifier, its fields
 * and its dependencies. A ticket that does not fails with an invalid request, whose message names each such ticket.
 */
const checkLocked = (task: Task, tickets: readonly NewTicket[]): void => {
  const changed = task.tickets.filter(
    (stored) => stored.status !== 'not-started' && !isSameTicket(stored, tickets[stored.id - 1]),
  );
  if (changed.length === 0) return;
  const names = changed.map(({ id, status }) => `${id} (${status})`).join(', ');
  const one = changed.length === 1;
  throw new RpcError(
    RpcErrorCode.INVALID_REQUEST,
    `${one ? 'Ticket' : 'Tickets'} ${names} of task ${task.id} started already, so ${one ? 'it' : 'each'} must stay as stored, with the same number, fields and dependencies. Only a ticket that is not-started may change or go away, and a new ticket goes at the end`,
  );
};

/**
 * Returns whether `ticket` has every field and every dependency of `stored`.
 */
const isSameTicket = (stored: Ticket, ticket: NewTicket | undefined): boolean =>
  ticket !== undefined &&
  stored.mode === ticket.mode &&
  stored.type === ticket.type &&
  stored.complexity === ticket.complexity &&
  stored.slug === ticket.slug &&
  stored.summary === ticket.summary &&
  stored.description === ticket.description &&
  stored.fixes === ticket.fixes &&
  stored.dependsOn.join() === ticket.dependsOn.join();

/**
 * Checks that each ticket of `tickets` whose work has not started fixes only a ticket of `task` that needs review. A
 * ticket whose work started stays as stored, so the ticket that it fixes may be done since. A ticket that does not
 * fails with an invalid request.
 */
const checkFixes = (task: Task, tickets: readonly NewTicket[]): void => {
  tickets.forEach(({ fixes }, index) => {
    const started = (task.tickets[index]?.status ?? 'not-started') !== 'not-started';
    if (fixes === null || started) return;
    const status = task.tickets[fixes - 1]?.status ?? 'not-started';
    if (status !== 'needs-review')
      throw new RpcError(
        RpcErrorCode.INVALID_REQUEST,
        `Ticket ${index + 1} fixes ticket ${fixes}, which is ${status}, and only a ticket whose work landed and needs review can get a fix`,
      );
  });
};
