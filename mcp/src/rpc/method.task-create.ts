import { z } from 'zod';
import { GOAL_SOURCES, type Task } from '../storage/task-store.ts';
import type { Method } from './method.ts';
import { SLUG } from './slug.ts';

/**
 * Schema of the parameters of `taskCreate`.
 */
const PARAMS = z.object({
  slug: SLUG.describe(
    'Short name of the task, derived from what the user asked for: exactly three lowercase words joined by hyphens',
  ),
  summary: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^\r\n]*$/, 'Must be one line')
    .describe('Summary of the first goal, on one line'),
  details: z.string().trim().min(1).optional().describe('Further information and comments on the first goal'),
  source: z.enum(GOAL_SOURCES).describe('Who the first goal came from: user, or agent for an accepted suggestion'),
});

/**
 * `Method` named `taskCreate`, which creates a task with the status `plan-goals` and its first goal, and returns it.
 */
export const taskCreateMethod: Method<typeof PARAMS, Task> = {
  name: 'taskCreate',
  description:
    'Creates a task of the atomic workflow with its first goal, once the user approved that goal, and returns it.',
  agent: true,
  params: PARAMS,
  handle: async ({ slug, summary, details = null, source }, { tasks, clock }) =>
    tasks.create({ slug, createdAt: clock.now(), goal: { summary, details, source } }),
};
