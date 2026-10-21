import { z } from 'zod';
import { TICKET_COMPLEXITIES, type Task } from '../storage/task-store.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method } from './method.ts';
import { openTask } from './open-task.ts';
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
        complexity: z
          .enum(TICKET_COMPLEXITIES)
          .describe(
            'simple for mechanical work that follows an existing pattern, moderate for several files with small decisions, complex for cross-cutting work, tricky logic or real judgement',
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
      }),
    )
    .min(1)
    .describe('Whole list of tickets in order, which replaces the stored one. Ticket n gets the identifier n'),
});

/**
 * `Method` named `ticketsSave`, which replaces the tickets of a task that is not complete, numbers them from 1 in
 * their order, and returns the task. A task that does not exist, and a ticket that depends on itself, on a later
 * ticket or on one ticket twice, fail with invalid parameters. A complete task fails with an invalid request.
 */
export const ticketsSaveMethod: Method<typeof PARAMS, Task> = {
  name: 'ticketsSave',
  description:
    'Replaces the tickets of a task of the atomic workflow with a whole new list of them, and returns the task.',
  agent: true,
  params: PARAMS,
  handle: async ({ taskId, tickets }, context) => {
    await openTask(taskId, context);
    const invalid = tickets.findIndex(
      ({ dependsOn }, index) => new Set(dependsOn).size !== dependsOn.length || dependsOn.some((id) => id > index),
    );
    if (invalid !== -1)
      throw new RpcError(
        RpcErrorCode.INVALID_PARAMS,
        `Ticket ${invalid + 1} must depend on earlier tickets, each once`,
      );
    await context.tasks.setTickets(taskId, tickets);
    return taskGetMethod.handle({ taskId }, context);
  },
};
