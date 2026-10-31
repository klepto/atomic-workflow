import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, TicketStatus } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskListMethod } from './method.task-list.ts';
import type { MethodContext } from './method.ts';

/**
 * Ticket of the tests, whose fields do not matter to them.
 */
const TICKET: NewTicket = {
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: 'add-cache-layer',
  summary: 'Adds the cache layer',
  description: 'Add the cache layer.',
  dependsOn: [],
  fixes: null,
};

/**
 * Creates a task with the slug `slug` at the time `createdAt`, in ms since the epoch, in the task store of `context`,
 * with one ticket of each status of `statuses`.
 */
const createTask = async (
  context: MethodContext,
  slug: string,
  createdAt: number,
  statuses: readonly TicketStatus[] = [],
): Promise<void> => {
  const task = await context.tasks.create({
    slug,
    createdAt,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setTickets(
    task.id,
    statuses.map(() => TICKET),
  );
  for (const [index, status] of statuses.entries())
    await context.tasks.setTicketProgress(task.id, index + 1, { status, stage: null, blockedReason: null });
};

describe('taskList', () => {
  it('returns no tasks for a repository without tasks', async () => {
    assert.deepEqual(await testCall(taskListMethod, {}, testMethodContext()), { tasks: [] });
  });

  it('returns the summary of each task in the order of their ids with the counts of their tickets', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis', 1_000, ['done', 'needs-review', 'in-progress', 'not-started']);
    await createTask(context, 'login-page-form', 2_000);
    await createTask(context, 'search-index-rebuild', 3_000, ['blocked', 'done']);
    await context.tasks.setStatus(1, 'complete');
    await context.tasks.startRun(1, 4_000);
    await context.tasks.endRun(1, 5_000);
    assert.deepEqual(await testCall(taskListMethod, {}, context), {
      tasks: [
        {
          id: 1,
          slug: 'cache-layer-redis',
          status: 'complete',
          createdAt: 1_000,
          runStartedAt: 4_000,
          runEndedAt: 5_000,
          completedTickets: 2,
          totalTickets: 4,
        },
        {
          id: 2,
          slug: 'login-page-form',
          status: 'plan-goals',
          createdAt: 2_000,
          runStartedAt: null,
          runEndedAt: null,
          completedTickets: 0,
          totalTickets: 0,
        },
        {
          id: 3,
          slug: 'search-index-rebuild',
          status: 'plan-goals',
          createdAt: 3_000,
          runStartedAt: null,
          runEndedAt: null,
          completedTickets: 1,
          totalTickets: 2,
        },
      ],
    });
  });
});
