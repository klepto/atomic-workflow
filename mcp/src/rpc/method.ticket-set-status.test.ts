import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, TaskStatus, Ticket, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { ticketSetStatusMethod } from './method.ticket-set-status.ts';
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
 * Sets the progress of the ticket `ticketId` of the task `taskId` in the task store of `context` to `progress`, with
 * no stage and no reason unless `progress` gives them.
 */
const setProgress = async (
  context: MethodContext,
  taskId: number,
  ticketId: number,
  progress: Partial<TicketProgress> & Pick<TicketProgress, 'status'>,
): Promise<void> => {
  await context.tasks.setTicketProgress(taskId, ticketId, { stage: null, blockedReason: null, ...progress });
};

/**
 * Returns the ticket `ticketId` of the task `taskId` as the task store of `context` holds it.
 */
const storedTicket = async (context: MethodContext, taskId: number, ticketId: number): Promise<Ticket | undefined> =>
  (await context.tasks.get(taskId))?.tickets.find(({ id }) => id === ticketId);

/**
 * Returns a check of `assert.rejects` that passes for an `RpcError` of the code `code` whose message matches
 * `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

describe('ticketSetStatus', () => {
  it('returns the ticket with its new progress, which the store holds', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    const ticket = await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context);
    assert.equal(ticket.status, 'in-progress');
    assert.deepEqual(ticket, await storedTicket(context, taskId, 1));
  });

  it('sets done on a ticket that needs review', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'needs-review' });
    const ticket = await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'done' }, context);
    assert.deepEqual(
      { status: ticket.status, stage: ticket.stage, blockedReason: ticket.blockedReason },
      { status: 'done', stage: null, blockedReason: null },
    );
    assert.equal((await storedTicket(context, taskId, 1))?.status, 'done');
  });

  it('refuses done for a ticket that does not need review', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'done' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /only a ticket that needs review can be done/),
    );
    assert.equal((await storedTicket(context, taskId, 1))?.status, 'not-started');
  });

  it('refuses done while a follow-up ticket that fixes the ticket has not landed, and names it', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'fix-cache-store', dependsOn: [1], fixes: 1 }),
      newTicket({ slug: 'fix-cache-keys', dependsOn: [1], fixes: 1 }),
    ]);
    await setProgress(context, taskId, 1, { status: 'needs-review' });
    await setProgress(context, taskId, 3, { status: 'needs-review' });
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'done' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /follow-up ticket 2-fix-cache-store \(not-started\), which fixes it/),
    );
    assert.equal((await storedTicket(context, taskId, 1))?.status, 'needs-review');
  });

  it('sets done once every follow-up ticket that fixes the ticket has landed', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'fix-cache-store', dependsOn: [1], fixes: 1 }),
    ]);
    await setProgress(context, taskId, 1, { status: 'needs-review' });
    await setProgress(context, taskId, 2, { status: 'needs-review' });
    const ticket = await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'done' }, context);
    assert.equal(ticket.status, 'done');
  });

  for (const status of ['not-started', 'in-progress', 'blocked'] as const) {
    it(`refuses ${status} for a ticket whose work landed`, async () => {
      const context = testMethodContext({ caller: testConnection() });
      const taskId = await taskWith(context, [newTicket(), newTicket()]);
      await setProgress(context, taskId, 1, { status: 'needs-review' });
      await setProgress(context, taskId, 2, { status: 'done' });
      const reason = status === 'blocked' ? 'The user must choose a size' : undefined;
      for (const ticketId of [1, 2])
        await assert.rejects(
          testCall(ticketSetStatusMethod, { taskId, ticketId, status, reason }, context),
          rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /landed already/),
        );
    });
  }

  it('sets blocked with its reason', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    const ticket = await testCall(
      ticketSetStatusMethod,
      { taskId, ticketId: 1, status: 'blocked', reason: 'The user must choose a size' },
      context,
    );
    assert.equal(ticket.blockedReason, 'The user must choose a size');
    assert.equal((await storedTicket(context, taskId, 1))?.blockedReason, 'The user must choose a size');
  });

  it('refuses blocked without a reason', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'blocked' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /A reason is needed for the status blocked/),
    );
  });

  it('refuses a reason for a status other than blocked', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress', reason: 'No reason' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /only for it/),
    );
  });

  it('clears the reason of a blocked ticket that goes on', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'blocked', blockedReason: 'The user must choose a size' });
    const ticket = await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context);
    assert.equal(ticket.blockedReason, null);
  });

  it('sets the stage of a ticket of the type code in progress', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    const ticket = await testCall(
      ticketSetStatusMethod,
      { taskId, ticketId: 1, status: 'in-progress', stage: 'tests' },
      context,
    );
    assert.equal(ticket.stage, 'tests');
    assert.equal((await storedTicket(context, taskId, 1))?.stage, 'tests');
  });

  it('refuses a stage for a status other than in-progress and blocked', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'not-started', stage: 'prototype' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /A ticket that is not-started has no stage/),
    );
  });

  it('refuses a stage for a ticket of the type other', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket({ type: 'other' })]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress', stage: 'prototype' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is of the type other, which has no stages/),
    );
  });

  it('keeps the stored stage of a working status when the stage is left out', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'in-progress', stage: 'tests' });
    const ticket = await testCall(
      ticketSetStatusMethod,
      { taskId, ticketId: 1, status: 'blocked', reason: 'The user must choose a size' },
      context,
    );
    assert.equal(ticket.stage, 'tests');
    assert.equal((await storedTicket(context, taskId, 1))?.stage, 'tests');
  });

  it('clears the stage of a working status for a null stage', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'in-progress', stage: 'tests' });
    const ticket = await testCall(
      ticketSetStatusMethod,
      { taskId, ticketId: 1, status: 'in-progress', stage: null },
      context,
    );
    assert.equal(ticket.stage, null);
  });

  it('clears the stored stage for a status other than in-progress and blocked', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'in-progress', stage: 'tests' });
    const ticket = await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'not-started' }, context);
    assert.equal(ticket.stage, null);
    assert.equal((await storedTicket(context, taskId, 1))?.stage, null);
  });

  it('claims a ticket in progress for the caller', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller });
    const taskId = await taskWith(context, [newTicket()]);
    await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context);
    assert.equal(context.ticketClaims.isHeldByOther(taskId, 1, caller), false);
    assert.equal(context.ticketClaims.isHeldByOther(taskId, 1, testConnection()), true);
  });

  it('refuses a ticket in progress for another caller', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const taskId = await taskWith(context, [newTicket()]);
    await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context);
    await assert.rejects(
      testCall(
        ticketSetStatusMethod,
        { taskId, ticketId: 1, status: 'in-progress' },
        { ...context, caller: testConnection() },
      ),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 of task 1 is in progress in another session/),
    );
  });

  it('refuses in-progress for a caller without a connection', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Only a client that is connected/),
    );
    assert.equal((await storedTicket(context, taskId, 1))?.status, 'not-started');
  });

  it('releases the claim of the ticket for a status other than in-progress', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller });
    const taskId = await taskWith(context, [newTicket()]);
    await testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'in-progress' }, context);
    await testCall(
      ticketSetStatusMethod,
      { taskId, ticketId: 1, status: 'blocked', reason: 'The user must choose a size' },
      context,
    );
    assert.equal(context.ticketClaims.isHeldByOther(taskId, 1, testConnection()), false);
  });

  it('refuses a ticket that another session holds, and keeps its progress', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setProgress(context, taskId, 1, { status: 'in-progress' });
    context.ticketClaims.claim(taskId, 1, testConnection());
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'not-started' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /in progress in another session/),
    );
    assert.equal((await storedTicket(context, taskId, 1))?.status, 'in-progress');
  });

  it('rejects a task that does not exist with invalid params', async () => {
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId: 9, ticketId: 1, status: 'not-started' }, testMethodContext()),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid params', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 5, status: 'not-started' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Task 1 has no ticket 5/),
    );
  });

  it('rejects a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'plan-tickets');
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'not-started' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is not complete/),
    );
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'done');
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'not-started' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is done/),
    );
  });

  it('rejects the status needs-review with invalid params', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'needs-review' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /status/),
    );
  });

  it('rejects a reason without text with invalid params', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketSetStatusMethod, { taskId, ticketId: 1, status: 'blocked', reason: '   ' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /reason/),
    );
  });
});
