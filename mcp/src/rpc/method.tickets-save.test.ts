import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, Task, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { ticketsSaveMethod } from './method.tickets-save.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Progress of a ticket whose work runs in the stage `prototype`.
 */
const IN_PROGRESS: TicketProgress = { status: 'in-progress', stage: 'prototype', blockedReason: null };

/**
 * Progress of a ticket whose work landed and needs review.
 */
const NEEDS_REVIEW: TicketProgress = { status: 'needs-review', stage: null, blockedReason: null };

/**
 * Returns a whole `NewTicket` of the tests, with each field of `overrides` in place of its default.
 */
const newTicket = (overrides: Partial<NewTicket> = {}): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: 'add-cache-layer',
  summary: 'Adds the cache layer',
  description: 'Add the cache layer.',
  dependsOn: [],
  fixes: null,
  ...overrides,
});

/**
 * Creates a task with one goal and a design in the task store of `context`, and returns it.
 */
const createTask = async (context: MethodContext): Promise<Task> => {
  const task = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setDesign(task.id, '# Design');
  return task;
};

/**
 * Creates a task whose plan is complete with the tickets `tickets` in the task store of `context`, and sets the
 * progress of ticket n to `progress[n - 1]`, or keeps it not started for `undefined`. Returns the task.
 */
const createCompleteTask = async (
  context: MethodContext,
  tickets: readonly NewTicket[],
  progress: readonly (TicketProgress | undefined)[],
): Promise<Task> => {
  const task = await createTask(context);
  await context.tasks.setTickets(task.id, tickets);
  for (const [index, ticketProgress] of progress.entries())
    if (ticketProgress !== undefined) await context.tasks.setTicketProgress(task.id, index + 1, ticketProgress);
  await context.tasks.setStatus(task.id, 'complete');
  return task;
};

describe('ticketsSave', () => {
  it('stores the tickets numbered from 1 in their order, not started, and returns the task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const first = newTicket({ slug: 'add-cache-layer' });
    const second = newTicket({ slug: 'expire-cached-answers', mode: 'manual', complexity: null, dependsOn: [1] });
    const result = await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [first, second] }, context);
    assert.deepEqual(result, {
      ...task,
      design: '# Design',
      tickets: [
        { ...first, id: 1, status: 'not-started', stage: null, blockedReason: null },
        { ...second, id: 2, status: 'not-started', stage: null, blockedReason: null },
      ],
    });
  });

  it('fills the defaults of the complexity, the dependencies and the fix', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const fields = { mode: 'manual', type: 'other', slug: 'move-old-files', summary: 'Moves', description: 'Move.' };
    const result = await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [fields] }, context);
    assert.deepEqual(
      result.tickets.map(({ complexity, dependsOn, fixes }) => [complexity, dependsOn, fixes]),
      [[null, [], null]],
    );
  });

  it('replaces the stored tickets with the new list', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setTickets(task.id, [newTicket(), newTicket(), newTicket()]);
    const result = await testCall(
      ticketsSaveMethod,
      { taskId: task.id, tickets: [newTicket({ slug: 'only-new-ticket' })] },
      context,
    );
    assert.deepEqual(
      result.tickets.map(({ id, slug }) => [id, slug]),
      [[1, 'only-new-ticket']],
    );
  });

  it('adds the fixed ticket to the dependencies of its fix, sorted and each once', async () => {
    const context = testMethodContext();
    const landed = newTicket({ slug: 'add-cache-layer' });
    const task = await createCompleteTask(context, [landed, newTicket()], [NEEDS_REVIEW]);
    const result = await testCall(
      ticketsSaveMethod,
      {
        taskId: task.id,
        tickets: [
          landed,
          newTicket(),
          newTicket({ dependsOn: [2], fixes: 1 }),
          newTicket({ dependsOn: [1], fixes: 1 }),
        ],
      },
      context,
    );
    assert.deepEqual(
      result.tickets.map(({ dependsOn, fixes }) => [dependsOn, fixes]),
      [
        [[], null],
        [[], null],
        [[1, 2], 1],
        [[1], 1],
      ],
    );
  });

  it('rejects a ticket that depends on itself with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket(), newTicket({ dependsOn: [2] })] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Ticket 2 must depend on earlier tickets, each once',
      },
    );
  });

  it('rejects a ticket that depends on a later ticket with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket({ dependsOn: [2] }), newTicket()] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Ticket 1 must depend on earlier tickets, each once',
      },
    );
  });

  it('rejects a ticket that depends on one ticket twice with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(
        ticketsSaveMethod,
        { taskId: task.id, tickets: [newTicket(), newTicket({ dependsOn: [1, 1] })] },
        context,
      ),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Ticket 2 must depend on earlier tickets, each once',
      },
    );
  });

  it('rejects a ticket that fixes itself with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket(), newTicket({ fixes: 2 })] }, context),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: 'Ticket 2 must fix an earlier ticket' },
    );
  });

  it('rejects a ticket that fixes a later ticket with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket({ fixes: 2 }), newTicket()] }, context),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: 'Ticket 1 must fix an earlier ticket' },
    );
  });

  it('rejects a manual ticket with a complexity with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(
        ticketsSaveMethod,
        { taskId: task.id, tickets: [newTicket({ mode: 'manual', complexity: 'simple' })] },
        context,
      ),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Ticket 1 must have a complexity, unless its mode is manual, which has none',
      },
    );
  });

  it('rejects a ticket of an agent without a complexity with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(
        ticketsSaveMethod,
        { taskId: task.id, tickets: [newTicket(), newTicket({ mode: 'attended', complexity: null })] },
        context,
      ),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'Ticket 2 must have a complexity, unless its mode is manual, which has none',
      },
    );
  });

  it('rejects an empty list of tickets with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: task.id, tickets: [] }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: 4, tickets: [newTicket()] }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 4 exists',
    });
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'done');
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket()] }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 is done, so its plan cannot change',
    });
  });

  it('keeps the progress of a started ticket of a complete task that stays as stored', async () => {
    const context = testMethodContext();
    const started = newTicket({ slug: 'add-cache-layer' });
    const task = await createCompleteTask(context, [started], [IN_PROGRESS]);
    const added = newTicket({ slug: 'expire-cached-answers', dependsOn: [1] });
    const result = await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [started, added] }, context);
    assert.deepEqual(result.tickets, [
      { ...started, id: 1, ...IN_PROGRESS },
      { ...added, id: 2, status: 'not-started', stage: null, blockedReason: null },
    ]);
  });

  it('changes a not started ticket of a complete task', async () => {
    const context = testMethodContext();
    const started = newTicket({ slug: 'add-cache-layer' });
    const task = await createCompleteTask(context, [started, newTicket()], [IN_PROGRESS]);
    const changed = newTicket({ summary: 'Adds the cache layer in Redis', mode: 'manual', complexity: null });
    const result = await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [started, changed] }, context);
    assert.deepEqual(result.tickets[1], { ...changed, id: 2, status: 'not-started', stage: null, blockedReason: null });
  });

  it('removes a not started ticket of a complete task', async () => {
    const context = testMethodContext();
    const started = newTicket();
    const task = await createCompleteTask(context, [started, newTicket()], [IN_PROGRESS]);
    const result = await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [started] }, context);
    assert.deepEqual(
      result.tickets.map(({ id }) => id),
      [1],
    );
  });

  it('rejects a change of a started ticket of a complete task with an invalid request that names it', async () => {
    const context = testMethodContext();
    const started = newTicket();
    const task = await createCompleteTask(context, [started], [IN_PROGRESS]);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [{ ...started, summary: 'Other summary' }] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message: /^Ticket 1 \(in-progress\) of task 1 started already, so it must stay as stored/,
      },
    );
  });

  it('rejects a change of the dependencies of a started ticket with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createCompleteTask(
      context,
      [newTicket(), newTicket({ dependsOn: [1] })],
      [NEEDS_REVIEW, IN_PROGRESS],
    );
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket(), newTicket()] }, context),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_REQUEST, message: /^Ticket 2 \(in-progress\) of task 1/ },
    );
  });

  it('rejects a removal of started tickets of a complete task with an invalid request that names each', async () => {
    const context = testMethodContext();
    const task = await createCompleteTask(
      context,
      [newTicket(), newTicket(), newTicket()],
      [undefined, IN_PROGRESS, NEEDS_REVIEW],
    );
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket()] }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: /^Tickets 2 \(in-progress\), 3 \(needs-review\) of task 1 started already, so each must stay as stored/,
    });
  });

  it('keeps the stored tickets when it rejects the change of a started ticket', async () => {
    const context = testMethodContext();
    const task = await createCompleteTask(context, [newTicket(), newTicket()], [undefined, IN_PROGRESS]);
    const stored = await context.tasks.get(task.id);
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket()] }, context));
    assert.deepEqual(await context.tasks.get(task.id), stored);
  });

  it('rejects a fix of a ticket that does not need review with an invalid request', async () => {
    const context = testMethodContext();
    const started = newTicket();
    const task = await createCompleteTask(context, [started], [IN_PROGRESS]);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [started, newTicket({ fixes: 1 })] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message:
          'Ticket 2 fixes ticket 1, which is in-progress, and only a ticket whose work landed and needs review can get a fix',
      },
    );
  });

  it('rejects a fix of a new ticket of a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket(), newTicket({ fixes: 1 })] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message: /^Ticket 2 fixes ticket 1, which is not-started,/,
      },
    );
  });

  it('rejects a list that changes a ticket that another session holds with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createCompleteTask(context, [newTicket(), newTicket()], [NEEDS_REVIEW]);
    context.ticketClaims.claim(task.id, 2, testConnection());
    await assert.rejects(testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket()] }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Ticket 2 of task 1 is in progress in another session',
    });
  });

  it('rejects a fix of a ticket that a session other than the caller holds with an invalid request', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const landed = newTicket();
    const task = await createCompleteTask(context, [landed], [NEEDS_REVIEW]);
    context.ticketClaims.claim(task.id, 1, testConnection());
    await assert.rejects(
      testCall(ticketsSaveMethod, { taskId: task.id, tickets: [landed, newTicket({ fixes: 1 })] }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message: 'Ticket 1 of task 1 is in progress in another session',
      },
    );
  });

  it('saves a list while the caller itself holds a ticket that the list can change', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller });
    const task = await createCompleteTask(context, [newTicket()], []);
    context.ticketClaims.claim(task.id, 1, caller);
    const result = await testCall(
      ticketsSaveMethod,
      { taskId: task.id, tickets: [newTicket({ summary: 'New' })] },
      context,
    );
    assert.equal(result.tickets[0]?.summary, 'New');
  });

  it('releases the claims of the call once the list is stored', async () => {
    const context = testMethodContext();
    const task = await createCompleteTask(context, [newTicket()], []);
    await testCall(ticketsSaveMethod, { taskId: task.id, tickets: [newTicket()] }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });
});
