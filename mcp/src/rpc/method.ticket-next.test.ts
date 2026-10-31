import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, TaskStatus, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { ticketNextMethod } from './method.ticket-next.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Returns a whole `NewTicket` of the mode `unattended`, the type `code` and the complexity `simple`, with no
 * dependency, with each field of `overrides` in place of its default.
 */
const newTicket = (overrides: Partial<NewTicket> = {}): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: 'add-cache-store',
  summary: 'Adds the cache store.',
  description: 'Adds the cache store.',
  dependsOn: [],
  fixes: null,
  ...overrides,
});

/**
 * Creates a task with the tickets `tickets` and the status `status` in the task store of `context`, and returns its
 * identifier.
 */
const taskWith = async (
  context: MethodContext,
  tickets: readonly NewTicket[],
  status: TaskStatus = 'complete',
): Promise<number> => {
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setTickets(id, tickets);
  await context.tasks.setStatus(id, status);
  return id;
};

/**
 * Sets the progress of the ticket `ticketId` of the task `taskId` in the task store of `context` to the status
 * `status`, with no stage, and with the reason `blockedReason`, `null` by default.
 */
const setProgress = async (
  context: MethodContext,
  taskId: number,
  ticketId: number,
  status: TicketProgress['status'],
  blockedReason: string | null = null,
): Promise<void> => {
  await context.tasks.setTicketProgress(taskId, ticketId, { status, stage: null, blockedReason });
};

describe('ticketNext', () => {
  it('returns the first ready ticket in progress before the first ready ticket not started', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket(), newTicket()]);
    await setProgress(context, taskId, 2, 'in-progress');
    await setProgress(context, taskId, 3, 'in-progress');
    const { ticket } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket?.id, 2);
  });

  it('returns the first ready ticket not started when no ready ticket is in progress', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket(), newTicket()]);
    await setProgress(context, taskId, 1, 'done');
    const { ticket } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket?.id, 2);
  });

  it('returns the next ticket as stored', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket({ slug: 'add-cache-store' })]);
    const { ticket } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(ticket, (await context.tasks.get(taskId))?.tickets[0]);
  });

  it('lists every ticket that can be picked with its status and its mode in the order of their identifiers', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket({ slug: 'add-cache-store' }),
      newTicket({ slug: 'check-cache-load', mode: 'manual', complexity: null }),
      newTicket({ slug: 'tune-cache-size', mode: 'attended' }),
    ]);
    await setProgress(context, taskId, 3, 'in-progress');
    const { pickable } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(pickable, [
      { id: 1, slug: 'add-cache-store', status: 'not-started', mode: 'unattended' },
      { id: 2, slug: 'check-cache-load', status: 'not-started', mode: 'manual' },
      { id: 3, slug: 'tune-cache-size', status: 'in-progress', mode: 'attended' },
    ]);
  });

  it('lists a ticket that another session holds as waiting elsewhere before any other cause', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket({ slug: 'use-cache-store', dependsOn: [1] })]);
    await setProgress(context, taskId, 2, 'blocked', 'The user must choose a size');
    context.ticketClaims.claim(taskId, 2, testConnection());
    const { pickable, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(
      pickable.map(({ id }) => id),
      [1],
    );
    assert.deepEqual(waiting, [
      {
        id: 2,
        slug: 'use-cache-store',
        status: 'blocked',
        cause: 'elsewhere',
        blockedReason: 'The user must choose a size',
        pendingDependencies: [1],
      },
    ]);
  });

  it('lists a ready ticket that another session holds as waiting elsewhere', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, 'in-progress');
    context.ticketClaims.claim(taskId, 1, testConnection());
    const result = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(result, {
      ticket: null,
      pickable: [],
      waiting: [
        {
          id: 1,
          slug: 'add-cache-store',
          status: 'in-progress',
          cause: 'elsewhere',
          blockedReason: null,
          pendingDependencies: [],
        },
      ],
    });
  });

  it('picks a ticket that the caller holds itself', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller });
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, 'in-progress');
    context.ticketClaims.claim(taskId, 1, caller);
    const { ticket, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket?.id, 1);
    assert.deepEqual(waiting, []);
  });

  it('lists a ready blocked ticket as waiting blocked with its reason', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket({ slug: 'use-cache-store' })]);
    await setProgress(context, taskId, 1, 'blocked', 'The user must choose a size');
    const { ticket, pickable, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket?.id, 2);
    assert.deepEqual(
      pickable.map(({ id }) => id),
      [2],
    );
    assert.deepEqual(waiting, [
      {
        id: 1,
        slug: 'add-cache-store',
        status: 'blocked',
        cause: 'blocked',
        blockedReason: 'The user must choose a size',
        pendingDependencies: [],
      },
    ]);
  });

  it('lists a blocked ticket with a pending dependency as waiting blocked', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket({ slug: 'use-cache-store', dependsOn: [1] })]);
    await setProgress(context, taskId, 2, 'blocked', 'The user must choose a size');
    const { waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(
      waiting.map(({ id, cause, pendingDependencies }) => ({ id, cause, pendingDependencies })),
      [{ id: 2, cause: 'blocked', pendingDependencies: [1] }],
    );
  });

  it('lists a ticket whose dependencies have not landed as waiting for its dependencies', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'load-cache-config' }),
      newTicket({ slug: 'use-cache-store', dependsOn: [1, 2] }),
    ]);
    await setProgress(context, taskId, 1, 'in-progress');
    const { pickable, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(
      pickable.map(({ id }) => id),
      [1, 2],
    );
    assert.deepEqual(waiting, [
      {
        id: 3,
        slug: 'use-cache-store',
        status: 'not-started',
        cause: 'dependencies',
        blockedReason: null,
        pendingDependencies: [1, 2],
      },
    ]);
  });

  it('lists only the dependencies that have not landed as pending', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'load-cache-config' }),
      newTicket({ slug: 'use-cache-store', dependsOn: [1, 2] }),
    ]);
    await setProgress(context, taskId, 1, 'needs-review');
    const { waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(
      waiting.map(({ id, pendingDependencies }) => ({ id, pendingDependencies })),
      [{ id: 3, pendingDependencies: [2] }],
    );
  });

  it('picks a ticket once every ticket that it depends on has landed', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'load-cache-config' }),
      newTicket({ slug: 'use-cache-store', dependsOn: [1, 2] }),
    ]);
    await setProgress(context, taskId, 1, 'needs-review');
    await setProgress(context, taskId, 2, 'done');
    const { ticket, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket?.id, 3);
    assert.deepEqual(waiting, []);
  });

  it('lists a landed ticket neither as pickable nor as waiting', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket(), newTicket()]);
    await setProgress(context, taskId, 1, 'needs-review');
    await setProgress(context, taskId, 2, 'done');
    const { pickable, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.deepEqual(
      pickable.map(({ id }) => id),
      [3],
    );
    assert.deepEqual(waiting, []);
  });

  it('returns no ticket and empty lists when every ticket landed', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket()]);
    await setProgress(context, taskId, 1, 'needs-review');
    await setProgress(context, taskId, 2, 'done');
    assert.deepEqual(await testCall(ticketNextMethod, { taskId }, context), {
      ticket: null,
      pickable: [],
      waiting: [],
    });
  });

  it('returns no ticket when every ticket that has not landed waits', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket({ slug: 'use-cache-store', dependsOn: [1] })]);
    await setProgress(context, taskId, 1, 'blocked', 'The user must choose a size');
    const { ticket, pickable, waiting } = await testCall(ticketNextMethod, { taskId }, context);
    assert.equal(ticket, null);
    assert.deepEqual(pickable, []);
    assert.deepEqual(
      waiting.map(({ id, cause }) => ({ id, cause })),
      [
        { id: 1, cause: 'blocked' },
        { id: 2, cause: 'dependencies' },
      ],
    );
  });

  it('rejects a task that does not exist with invalid params', async () => {
    await assert.rejects(
      testCall(ticketNextMethod, { taskId: 9 }, testMethodContext()),
      (error) =>
        error instanceof RpcError &&
        error.code === RPC_ERROR_CODES.INVALID_PARAMS &&
        /No task 9 exists/.test(error.message),
    );
  });

  it('rejects a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'plan-tickets');
    await assert.rejects(
      testCall(ticketNextMethod, { taskId }, context),
      (error) =>
        error instanceof RpcError &&
        error.code === RPC_ERROR_CODES.INVALID_REQUEST &&
        /is not complete/.test(error.message),
    );
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'done');
    await assert.rejects(
      testCall(ticketNextMethod, { taskId }, context),
      (error) =>
        error instanceof RpcError && error.code === RPC_ERROR_CODES.INVALID_REQUEST && /is done/.test(error.message),
    );
  });
});
