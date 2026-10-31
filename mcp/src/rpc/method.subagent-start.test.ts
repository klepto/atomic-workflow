import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mapCreateSubagents } from '../attachment/subagents.map.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { subagentStartMethod } from './method.subagent-start.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Returns a context with the clock at 40 in which each new subagent attaches right after its orchestrator was asked to
 * spawn it, as the agent of the orchestrator would start it. Each field of `overrides` replaces its default.
 */
const startContext = (overrides: Partial<MethodContext> = {}): MethodContext => {
  const subagents = mapCreateSubagents();
  return testMethodContext({
    clock: testClock(40),
    subagents,
    awaitCommandLine: (sessionId) => {
      queueMicrotask(() => subagents.attach(sessionId));
      return `await ${sessionId}`;
    },
    ...overrides,
  });
};

/**
 * Registers the orchestrator session `sessionId` in `context` with the agent `codex`, binds it to a new connection,
 * and opens its inbox unless `withInbox` is false. Returns the connection.
 */
const attachOrchestrator = async (
  sessionId: string,
  context: MethodContext,
  withInbox = true,
): Promise<TestConnection> => {
  const fields = { agent: 'codex', directory: '/project', startedAt: 0, role: 'orchestrator', parentId: null } as const;
  await context.sessions.register(newSession({ ...fields, id: sessionId }));
  const connection = testConnection();
  context.sessionConnections.bind(sessionId, connection);
  if (withInbox) context.inboxes.open(sessionId, NEVER_CLOSED);
  return connection;
};

/**
 * Returns the contents of the messages that wait in the inbox of the session `sessionId` of `context`.
 */
const inboxContents = async (sessionId: string, context: MethodContext): Promise<readonly string[]> => {
  const delivery = await context.inboxes.take(sessionId, 0);
  return delivery.status === 'messages' ? delivery.messages.map(({ content }) => content) : [];
};

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('subagentStartMethod', () => {
  it('starts a subagent inside the orchestrator session that attached last, and returns its session id', async () => {
    const context = startContext();
    await attachOrchestrator('first', context);
    await attachOrchestrator('main', context);
    assert.deepEqual(await testCall(subagentStartMethod, {}, context), { sessionId: 'session-1' });
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'session-1', parentId: 'main' }]);
  });

  it('registers the subagent in the agent and the directory of its orchestrator, started now, with no work', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await testCall(subagentStartMethod, {}, context);
    const fields = {
      agent: 'codex',
      directory: '/project',
      startedAt: 40,
      role: 'subagent',
      parentId: 'main',
    } as const;
    assert.deepEqual(await context.sessions.get('session-1'), newSession({ ...fields, id: 'session-1' }));
  });

  it('asks the orchestrator to spawn the subagent with its session id and its wait command', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await testCall(subagentStartMethod, {}, context);
    const [message = ''] = await inboxContents('main', context);
    assert.match(message, /subagent_type "atomic-workflow:worker"/);
    assert.match(message, /> Your session id is session-1\. Your wait command is:\n> `await session-1`/);
  });

  it('asks the session server of the orchestrator to follow the subagent once it attached', async () => {
    const context = startContext();
    const connection = await attachOrchestrator('main', context);
    await testCall(subagentStartMethod, {}, context);
    assert.deepEqual(connection.requests, [
      { method: 'subagentFollow', params: { sessionId: 'session-1', parentId: 'main' } },
    ]);
  });

  it('starts the subagent inside the orchestrator session that parentId names', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await attachOrchestrator('last', context);
    await testCall(subagentStartMethod, { parentId: 'main' }, context);
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'session-1', parentId: 'main' }]);
  });

  it('gives the prompt to the subagent as its first message, logged as a message of the user', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await testCall(subagentStartMethod, { prompt: 'Plan the cache' }, context);
    assert.deepEqual(await inboxContents('session-1', context), ['Plan the cache']);
    const logged = await context.messageLog.list({ sessionId: 'session-1', alias: undefined, after: 0, limit: 10 });
    assert.deepEqual(
      logged.map(({ sender, content, timestamp }) => ({ sender, content, timestamp })),
      [{ sender: 'user', content: 'Plan the cache', timestamp: 40 }],
    );
  });

  it('gives the subagent the job of the skill that the prompt runs, and the task taskId', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    const goal = { summary: 'Cache', details: null, source: 'user' } as const;
    const task = await context.tasks.create({ slug: 'cache-layer-redis', createdAt: 0, goal });
    await testCall(subagentStartMethod, { prompt: '/atomic-workflow:plan add a cache', taskId: task.id }, context);
    const session = await context.sessions.get('session-1');
    assert.deepEqual([session?.job, session?.taskId], ['plan', task.id]);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await assert.rejects(testCall(subagentStartMethod, { taskId: 9 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 9 exists',
    });
  });

  it('rejects a call without an attached orchestrator session with an invalid request', async () => {
    await assert.rejects(testCall(subagentStartMethod, {}, startContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'No orchestrator session is attached',
    });
  });

  it('rejects a parentId that names no attached orchestrator session with an invalid request', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    await assert.rejects(testCall(subagentStartMethod, { parentId: 'other' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
    });
  });

  it('stops the subagent and fails with an internal error when the orchestrator has no inbox', async () => {
    const context = startContext();
    await attachOrchestrator('main', context, false);
    await assert.rejects(testCall(subagentStartMethod, { prompt: 'Plan the cache' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INTERNAL_ERROR,
      message: 'The subagent session-1 did not attach: No session main is attached',
    });
    assert.deepEqual([context.subagents.list(), context.inboxes.find('session-1')], [[], undefined]);
  });

  it('stops the subagent and fails with an internal error when its wait for the attach aborts', async () => {
    const timeout = new AbortController();
    const context = startContext({
      timeoutSignal: () => timeout.signal,
      awaitCommandLine: (sessionId) => {
        queueMicrotask(() => timeout.abort(new Error('The subagent took too long')));
        return `await ${sessionId}`;
      },
    });
    await attachOrchestrator('main', context);
    await assert.rejects(testCall(subagentStartMethod, {}, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INTERNAL_ERROR,
      message: 'The subagent session-1 did not attach: The subagent took too long',
    });
    assert.deepEqual([context.subagents.list(), context.inboxes.find('session-1')], [[], undefined]);
  });

  it('rejects as the request to follow the subagent does, and keeps the subagent running', async () => {
    const context = startContext();
    await attachOrchestrator('main', context);
    const failing = {
      ...testConnection(),
      request: async () => {
        throw new Error('The session server is gone');
      },
    };
    context.sessionConnections.bind('main', failing);
    await assert.rejects(testCall(subagentStartMethod, {}, context), {
      name: 'Error',
      message: 'The session server is gone',
    });
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'session-1', parentId: 'main' }]);
  });
});
