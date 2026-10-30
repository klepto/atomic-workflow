import { z } from 'zod';
import { type Task, TICKET_COMPLEXITIES, TICKET_MODES, TICKET_TYPES } from '../storage/task-store.ts';
import type { Method } from './method.ts';
import { saveTickets } from './save-tickets.ts';
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
            'simple for work that follows an existing pattern or makes small decisions inside one part, across one or several files, complex for cross-cutting work, tricky logic or real judgement. null for a manual ticket, and only for one',
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
 * `Method` named `ticketsSave`, which replaces the tickets of a task that is not done, numbers them from 1 in their
 * order, and returns the task, as `saveTickets` does, and fails as it does.
 */
export const ticketsSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'ticketsSave',
  description:
    'Replaces the tickets of a task of the atomic workflow with a whole new list of them, and returns the task. On a complete task, each ticket whose work started must stay as stored.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, tickets }, context) => saveTickets(taskId, tickets, context),
};
