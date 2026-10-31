import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { NewTicket, TicketStatus } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskStopMethod } from './method.task-stop.ts';
import type { MethodContext } from './method.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Message of the failure of each request of a `failingConnection`.
 */
const FAILURE = 'The session server is gone';

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
 * Creates a complete task with the tickets `tickets` in the task store of `context`, and returns its identifier.
 */
const completeTask = async (context: MethodContext, tickets: readonly NewTicket[] = []): Promise<number> => {
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setTickets(id, tickets);
  await context.tasks.setStatus(id, 'complete');
  return id;
};

/**
 * Returns a whole `RegisteredSession` of an orchestrator session of the agent `claude`, for no task, with each field
 * of `overrides` in place of its default.
 */
const session = (overrides: Partial<RegisteredSession> & Pick<RegisteredSession, 'id'>): RegisteredSession => ({
  agent: 'claude',
  directory: '/repository',
  startedAt: 0,
  role: 'orchestrator',
  parentId: null,
  taskId: null,
  job: null,
  ticketId: null,
  alias: null,
  contextTokens: null,
  model: null,
  effort: null,
  ...overrides,
});

/**
 * Returns a `TestConnection` whose session server knows no background task of any subagent.
 */
const sessionServer = (): TestConnection => {
  const connection = testConnection();
  connection.answer('subagentTaskId', { backgroundTaskId: null });
  return connection;
};

/**
 * Returns an `RpcConnection` that never closes, and whose every request rejects with an `Error` of the message
 * `FAILURE`.
 */
const failingConnection = (): RpcConnection => ({
  request: async () => {
    throw new Error(FAILURE);
  },
  closed: new Promise<void>(() => undefined),
  close: () => undefined,
});

/**
 * Registers the orchestrator session `id` in the session store of `context`, and binds it to `connection`.
 */
const attachOrchestrator = async (context: MethodContext, id: string, connection: RpcConnection): Promise<void> => {
  await context.sessions.register(session({ id }));
  context.sessionConnections.bind(id, connection);
};

/**
 * Registers the subagent session `id` of the task `taskId` inside the orchestrator session `parentId` in the session
 * store of `context`, and starts and attaches it, over `connection`.
 */
const attachSubagent = async (
  context: MethodContext,
  id: string,
  parentId: string,
  taskId: number,
  connection: RpcConnection,
): Promise<void> => {
  await context.sessions.register(session({ id, role: 'subagent', parentId, taskId, job: 'implement' }));
  context.subagents.start(id, parentId, connection);
  context.subagents.attach(id);
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

describe('taskStop', () => {
  it('returns the session ids of the stopped subagents, which are no longer listed', async () => {
    const context = testMethodContext();
    const taskId = await completeTask(context);
    const connection = sessionServer();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', taskId, connection);
    await attachSubagent(context, 'subagent-b', 'orchestrator-a', taskId, connection);
    const { stopped } = await testCall(taskStopMethod, { taskId }, context);
    assert.deepEqual([...stopped].sort(), ['subagent-a', 'subagent-b']);
    assert.deepEqual(context.subagents.list(), []);
  });

  it('asks the session server of the orchestrator for the background task of each subagent', async () => {
    const context = testMethodContext();
    const taskId = await completeTask(context);
    const connection = sessionServer();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', taskId, connection);
    await testCall(taskStopMethod, { taskId }, context);
    assert.deepEqual(connection.requests, [{ method: 'subagentTaskId', params: { sessionId: 'subagent-a' } }]);
  });

  it('asks the orchestrator to stop the background task that runs a subagent', async (test) => {
    // The delivery starts the batch timer of the inbox, which a real timer must not run.
    test.mock.timers.enable({ apis: ['setTimeout'] });
    const context = testMethodContext();
    const taskId = await completeTask(context);
    const connection = testConnection();
    connection.answer('subagentTaskId', { backgroundTaskId: 'background-7' });
    await attachOrchestrator(context, 'orchestrator-a', connection);
    context.inboxes.open('orchestrator-a', connection.closed);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', taskId, connection);
    const { stopped } = await testCall(taskStopMethod, { taskId }, context);
    assert.deepEqual(stopped, ['subagent-a']);
    const delivery = await context.inboxes.take('orchestrator-a', 0);
    assert.equal(delivery.status, 'messages');
    assert.match(delivery.status === 'messages' ? (delivery.messages[0]?.content ?? '') : '', /task_id "background-7"/);
  });

  it('does not stop a subagent of another task', async () => {
    const context = testMethodContext();
    const taskId = await completeTask(context);
    const otherTaskId = await completeTask(context);
    const connection = sessionServer();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', otherTaskId, connection);
    const { stopped } = await testCall(taskStopMethod, { taskId }, context);
    assert.deepEqual(stopped, []);
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'subagent-a', parentId: 'orchestrator-a' }]);
    assert.deepEqual(connection.requests, []);
  });

  it('ends the active run of the task without any subagent', async () => {
    const context = testMethodContext({ clock: testClock(5_000) });
    const taskId = await completeTask(context);
    await context.tasks.startRun(taskId, 1_000);
    const { stopped } = await testCall(taskStopMethod, { taskId }, context);
    assert.deepEqual(stopped, []);
    const task = await context.tasks.get(taskId);
    assert.deepEqual(
      { startedAt: task?.runStartedAt, endedAt: task?.runEndedAt },
      { startedAt: 1_000, endedAt: 5_000 },
    );
  });

  it('releases the claims of unlanded tickets that the orchestrator holds, and keeps the others', async () => {
    const context = testMethodContext();
    const taskId = await completeTask(context, [newTicket(), newTicket(), newTicket(), newTicket()]);
    const connection = sessionServer();
    const other = testConnection();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', taskId, connection);
    await setStatus(context, taskId, 1, 'in-progress');
    await setStatus(context, taskId, 2, 'blocked');
    await setStatus(context, taskId, 4, 'needs-review');
    context.ticketClaims.claim(taskId, 1, connection);
    context.ticketClaims.claim(taskId, 2, connection);
    context.ticketClaims.claim(taskId, 3, other);
    context.ticketClaims.claim(taskId, 4, connection);
    await testCall(taskStopMethod, { taskId }, context);
    const stranger = testConnection();
    assert.deepEqual(
      [1, 2, 3, 4].map((ticketId) => context.ticketClaims.isHeldByOther(taskId, ticketId, stranger)),
      [false, false, true, true],
    );
  });

  it('keeps the claims of an orchestrator none of whose subagents it stopped', async () => {
    const context = testMethodContext();
    const taskId = await completeTask(context, [newTicket()]);
    const connection = sessionServer();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    context.ticketClaims.claim(taskId, 1, connection);
    await testCall(taskStopMethod, { taskId }, context);
    assert.equal(context.ticketClaims.isHeldByOther(taskId, 1, testConnection()), true);
  });

  it('stops the other subagents when one fails to stop, then fails with an internal error that names it', async () => {
    const context = testMethodContext({ clock: testClock(5_000) });
    const taskId = await completeTask(context);
    await context.tasks.startRun(taskId, 1_000);
    const connection = sessionServer();
    await attachOrchestrator(context, 'orchestrator-a', connection);
    const failing = failingConnection();
    await attachOrchestrator(context, 'orchestrator-b', failing);
    await attachSubagent(context, 'subagent-a', 'orchestrator-a', taskId, connection);
    await attachSubagent(context, 'subagent-b', 'orchestrator-b', taskId, failing);
    await assert.rejects(
      testCall(taskStopMethod, { taskId }, context),
      (error) =>
        error instanceof RpcError &&
        error.code === RPC_ERROR_CODES.INTERNAL_ERROR &&
        error.message === `Could not stop a subagent of task ${taskId}: subagent-b: ${FAILURE}`,
    );
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'subagent-b', parentId: 'orchestrator-b' }]);
    assert.equal((await context.tasks.get(taskId))?.runEndedAt, 5_000);
  });

  it('rejects a task that does not exist with invalid params', async () => {
    await assert.rejects(
      testCall(taskStopMethod, { taskId: 9 }, testMethodContext()),
      (error) =>
        error instanceof RpcError &&
        error.code === RPC_ERROR_CODES.INVALID_PARAMS &&
        /No task 9 exists/.test(error.message),
    );
  });
});
