import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { subagentCreateMethod } from './method.subagent-create.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

/**
 * Failure of a call that the state of the repository server does not allow.
 */
const INVALID_REQUEST = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_REQUEST };

/**
 * Returns a new ticket of the type `code` with the slug `slug`.
 */
const ticket = (slug: string): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug,
  summary: 'Builds a part of the cache.',
  description: 'Build it.',
  dependsOn: [],
  fixes: null,
});

/**
 * Context of a test of `subagentCreate`, with the connection of its caller.
 */
interface CreateContext {
  /**
   * Context of the call.
   */
  readonly context: MethodContext;

  /**
   * Connection of the caller, which serves the orchestrator session `main`.
   */
  readonly caller: TestConnection;
}

/**
 * Returns a context with the clock at 40, whose caller serves the registered orchestrator session `main`, and which
 * holds the task 1 with the tickets 1 and 2. The caller is `connection` when it is given, else a new test connection.
 */
const createContext = async (connection?: RpcConnection): Promise<CreateContext> => {
  const caller = testConnection();
  const context = testMethodContext({ clock: testClock(40), caller: connection ?? caller });
  const main = { id: 'main', agent: 'claude', directory: '/repository', startedAt: 0, role: 'orchestrator' } as const;
  await context.sessions.register(newSession({ ...main, parentId: null }));
  context.sessionConnections.bind('main', connection ?? caller);
  const goal = { summary: 'Cache', details: null, source: 'user' } as const;
  const task = await context.tasks.create({ slug: 'cache-layer-redis', createdAt: 0, goal });
  await context.tasks.setTickets(task.id, [ticket('cache-key-format'), ticket('cache-read-path')]);
  return { context, caller };
};

describe('subagentCreateMethod', () => {
  it('registers a subagent of the session of the caller that works on the task, and returns its session id', async () => {
    const { context } = await createContext();
    assert.deepEqual(await testCall(subagentCreateMethod, { taskId: 1 }, context), { sessionId: 'session-1' });
    const fields = {
      agent: 'claude',
      directory: '/repository',
      startedAt: 40,
      role: 'subagent',
      parentId: 'main',
    } as const;
    assert.deepEqual(await context.sessions.get('session-1'), newSession({ ...fields, id: 'session-1', taskId: 1 }));
  });

  it('counts the subagent as attached from the call on', async () => {
    const { context } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1 }, context);
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'session-1', parentId: 'main' }]);
  });

  it('opens no inbox for the subagent, which takes no messages', async () => {
    const { context } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1 }, context);
    assert.equal(context.inboxes.find('session-1'), undefined);
  });

  it('asks the session server of the caller to follow the subagent as a one-shot subagent', async () => {
    const { context, caller } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1 }, context);
    assert.deepEqual(caller.requests, [
      { method: 'subagentFollow', params: { sessionId: 'session-1', parentId: 'main', oneShot: true } },
    ]);
  });

  it('gives a subagent that implements a ticket the job implement and the ticket', async () => {
    const { context } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1, ticketId: 2 }, context);
    const session = await context.sessions.get('session-1');
    assert.deepEqual([session?.job, session?.ticketId], ['implement', 2]);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const { context } = await createContext();
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 9 }, context), {
      ...INVALID_PARAMS,
      message: 'No task 9 exists',
    });
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const { context } = await createContext();
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 1, ticketId: 9 }, context), {
      ...INVALID_PARAMS,
      message: 'Task 1 has no ticket 9',
    });
  });

  it('rejects a call without a caller with an invalid request', async () => {
    const { context } = await createContext();
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 1 }, { ...context, caller: undefined }), {
      ...INVALID_REQUEST,
      message: 'The caller serves no attached session',
    });
  });

  it('rejects a caller that serves no attached session with an invalid request', async () => {
    const { context } = await createContext();
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 1 }, { ...context, caller: testConnection() }), {
      ...INVALID_REQUEST,
      message: 'The caller serves no attached session',
    });
  });

  it('rejects a ticket that another attached subagent implements with an invalid request', async () => {
    const { context } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1, ticketId: 2 }, context);
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 1, ticketId: 2 }, context), {
      ...INVALID_REQUEST,
      message: 'Ticket 2 of task 1 runs in another subagent already. Wait for it to end',
    });
  });

  it('creates a subagent for a ticket whose subagent has ended', async () => {
    const { context } = await createContext();
    await testCall(subagentCreateMethod, { taskId: 1, ticketId: 2 }, context);
    context.subagents.stop('session-1');
    assert.deepEqual(await testCall(subagentCreateMethod, { taskId: 1, ticketId: 2 }, context), {
      sessionId: 'session-2',
    });
  });

  it('stops the subagent and fails with an internal error when the follow fails', async () => {
    const failing: RpcConnection = {
      ...testConnection(),
      request: async () => {
        throw new Error('The session server is gone');
      },
    };
    const { context } = await createContext(failing);
    await assert.rejects(testCall(subagentCreateMethod, { taskId: 1 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INTERNAL_ERROR,
      message: 'The subagent session-1 cannot be followed: The session server is gone',
    });
    assert.deepEqual(context.subagents.list(), []);
  });
});
