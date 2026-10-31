import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, TaskStatus, TicketStatus } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { ticketRequestChangesMethod } from './method.ticket-request-changes.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Description of a reviewed ticket, with a section `## Verify` between two other sections.
 */
const DESCRIPTION_WITH_VERIFY = [
  'Adds the cache store.',
  '## Verify\n\nRun `npm test` in `mcp/`.',
  '## Notes\n\nKeep the store small.',
].join('\n\n');

/**
 * Comments of a review.
 */
const REVIEW = '- `src/cache.ts` lines 3-5: drop the second lookup.';

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
 * Sets the status of the ticket `ticketId` of the task `taskId` in the task store of `context` to `status`, with no
 * stage and no reason.
 */
const setStatus = async (
  context: MethodContext,
  taskId: number,
  ticketId: number,
  status: TicketStatus,
): Promise<void> => {
  await context.tasks.setTicketProgress(taskId, ticketId, { status, stage: null, blockedReason: null });
};

/**
 * Returns a check of `assert.rejects` that passes for an `RpcError` of the code `code` whose message matches
 * `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

describe('ticketRequestChanges', () => {
  it('appends a follow-up ticket with the mode, the type and the complexity of the reviewed ticket', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'load-cache-config', mode: 'attended', type: 'other', complexity: 'complex', dependsOn: [1] }),
    ]);
    await setStatus(context, taskId, 1, 'done');
    await setStatus(context, taskId, 2, 'needs-review');
    const { ticket } = await testCall(ticketRequestChangesMethod, { taskId, ticketId: 2, review: REVIEW }, context);
    const { description: _, ...fields } = ticket;
    assert.deepEqual(fields, {
      id: 3,
      mode: 'attended',
      type: 'other',
      complexity: 'complex',
      slug: 'review-fixes-3',
      summary: 'Make the changes that the review of ticket 2-load-cache-config asked for.',
      dependsOn: [2],
      fixes: null,
      status: 'not-started',
      stage: null,
      blockedReason: null,
    });
  });

  it('stores the follow-up ticket as the last ticket of the task', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'needs-review');
    const { ticket } = await testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context);
    const tickets = (await context.tasks.get(taskId))?.tickets ?? [];
    assert.equal(tickets.length, 2);
    assert.deepEqual(tickets[1], ticket);
  });

  it('holds the review and the section Verify of the reviewed ticket in the description', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket({ description: DESCRIPTION_WITH_VERIFY })]);
    await setStatus(context, taskId, 1, 'needs-review');
    const { ticket } = await testCall(
      ticketRequestChangesMethod,
      { taskId, ticketId: 1, review: `  ${REVIEW}\n` },
      context,
    );
    assert.equal(ticket.description.includes(`## Review\n\n${REVIEW}\n\n`), true);
    assert.equal(ticket.description.endsWith('## Verify\n\nRun `npm test` in `mcp/`.'), true);
    assert.equal(ticket.description.includes('## Notes'), false);
  });

  it('holds no section Verify when the reviewed ticket has none', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'needs-review');
    const { ticket } = await testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context);
    assert.equal(ticket.description.includes(`## Review\n\n${REVIEW}`), true);
    assert.equal(ticket.description.includes('## Verify'), false);
  });

  it('approves a reviewed ticket that needs review', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'needs-review');
    const { approvalRefusal } = await testCall(
      ticketRequestChangesMethod,
      { taskId, ticketId: 1, review: REVIEW },
      context,
    );
    assert.equal(approvalRefusal, null);
    assert.equal((await context.tasks.get(taskId))?.tickets[0]?.status, 'done');
  });

  it('keeps a done reviewed ticket done', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'done');
    const { approvalRefusal } = await testCall(
      ticketRequestChangesMethod,
      { taskId, ticketId: 1, review: REVIEW },
      context,
    );
    assert.equal(approvalRefusal, null);
    assert.equal((await context.tasks.get(taskId))?.tickets[0]?.status, 'done');
  });

  it('returns a refused approval and still adds the follow-up ticket', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [
      newTicket(),
      newTicket({ slug: 'fix-cache-store', dependsOn: [1], fixes: 1 }),
    ]);
    await setStatus(context, taskId, 1, 'needs-review');
    const { ticket, approvalRefusal } = await testCall(
      ticketRequestChangesMethod,
      { taskId, ticketId: 1, review: REVIEW },
      context,
    );
    assert.match(approvalRefusal ?? '', /waits for its follow-up ticket 2-fix-cache-store \(not-started\)/);
    const tickets = (await context.tasks.get(taskId))?.tickets ?? [];
    assert.equal(tickets[0]?.status, 'needs-review');
    assert.deepEqual(tickets[2], ticket);
  });

  it('opens a done task again as complete with the follow-up ticket', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'done');
    await setStatus(context, taskId, 1, 'done');
    await testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context);
    const task = await context.tasks.get(taskId);
    assert.equal(task?.status, 'complete');
    assert.deepEqual(
      task?.tickets.map(({ slug, status }) => ({ slug, status })),
      [
        { slug: 'add-cache-store', status: 'done' },
        { slug: 'review-fixes-2', status: 'not-started' },
      ],
    );
  });

  it('sets a done task done again when the save of the tickets fails', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket(), newTicket({ slug: 'load-cache-config' })], 'done');
    await setStatus(context, taskId, 1, 'done');
    context.ticketClaims.claim(taskId, 2, testConnection());
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /in progress in another session/),
    );
    const task = await context.tasks.get(taskId);
    assert.equal(task?.status, 'done');
    assert.equal(task?.tickets.length, 2);
  });

  it('rejects a task that does not exist with invalid params', async () => {
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId: 9, ticketId: 1, review: REVIEW }, testMethodContext()),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid params', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId, ticketId: 5, review: REVIEW }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Task 1 has no ticket 5/),
    );
  });

  it('rejects a review without text with invalid params', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'needs-review');
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: ' \n ' }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /review/),
    );
  });

  it('rejects a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()], 'plan-tickets');
    await setStatus(context, taskId, 1, 'needs-review');
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is not complete/),
    );
  });

  it('rejects a ticket whose work has not landed with an invalid request', async () => {
    const context = testMethodContext();
    const taskId = await taskWith(context, [newTicket()]);
    await setStatus(context, taskId, 1, 'in-progress');
    await assert.rejects(
      testCall(ticketRequestChangesMethod, { taskId, ticketId: 1, review: REVIEW }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 is in-progress, so its work has not landed/),
    );
    assert.equal((await context.tasks.get(taskId))?.tickets.length, 1);
  });
});
