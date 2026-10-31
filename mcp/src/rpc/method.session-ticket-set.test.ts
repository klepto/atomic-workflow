import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegisteredSession } from '../storage/session-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionTicketSetMethod } from './method.session-ticket-set.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Registers the orchestrator session `main` in `context`, and its subagent `sub` with the fields `fields`.
 */
const registerSubagent = async (context: MethodContext, fields: Partial<RegisteredSession> = {}): Promise<void> => {
  const base = { agent: 'claude', directory: '/repository', startedAt: 0 } as const;
  await context.sessions.register(newSession({ ...base, id: 'main', role: 'orchestrator', parentId: null }));
  await context.sessions.register({
    ...newSession({ ...base, id: 'sub', role: 'subagent', parentId: 'main' }),
    ...fields,
  });
};

/**
 * Returns the ticket that the session `sessionId` of `context` works on, or `undefined` for a session that is not
 * registered.
 */
const ticketOf = async (sessionId: string, context: MethodContext): Promise<number | null | undefined> =>
  (await context.sessions.get(sessionId))?.ticketId;

describe('sessionTicketSetMethod', () => {
  it('sets the ticket of a subagent that implements a ticket of its task', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1, job: 'implement' });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), 2);
  });

  it('sets the ticket of a subagent that runs a stage of the implementation', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1, job: 'implement-tests' });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), 2);
  });

  it('sets no ticket for a subagent whose job works on every ticket of its task', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1, job: 'implement-all' });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), null);
  });

  it('sets no ticket for a subagent with no job', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1 });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), null);
  });

  it('keeps the ticket of a subagent that works on a ticket already', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1, job: 'implement', ticketId: 1 });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), 1);
  });

  it('sets no ticket for a subagent that works on no task', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { job: 'implement' });
    await testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, context);
    assert.equal(await ticketOf('sub', context), null);
  });

  it('sets no ticket for an orchestrator session', async () => {
    const context = testMethodContext();
    const fields = { agent: 'claude', directory: '/repository', startedAt: 0, parentId: null } as const;
    const main = { ...fields, id: 'main', role: 'orchestrator', taskId: 1, job: 'implement' } as const;
    await context.sessions.register(newSession(main));
    await testCall(sessionTicketSetMethod, { sessionId: 'main', ticketId: 2 }, context);
    assert.equal(await ticketOf('main', context), null);
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(testCall(sessionTicketSetMethod, { sessionId: 'sub', ticketId: 2 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session sub is registered',
    });
  });
});
