import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionDeleteMethod } from './method.session-delete.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Returns a context in which the orchestrator session `main` and its subagent `sub` are registered, with one message
 * of each in the log.
 */
const registeredContext = async (): Promise<MethodContext> => {
  const context = testMethodContext();
  const base = { agent: 'claude', directory: '/repository', startedAt: 0 } as const;
  await context.sessions.register(newSession({ ...base, id: 'main', role: 'orchestrator', parentId: null }));
  await context.sessions.register(newSession({ ...base, id: 'sub', role: 'subagent', parentId: 'main' }));
  for (const sessionId of ['main', 'sub'])
    await context.messageLog.append({ sessionId, messageId: null, sender: 'agent', content: 'Done.', timestamp: 1 });
  return context;
};

/**
 * Binds the orchestrator session `main` of `context` to `connection` with an open inbox, and starts its subagent `sub`
 * with an open inbox, attached.
 */
const startSubagent = (context: MethodContext, connection: RpcConnection): void => {
  context.sessionConnections.bind('main', connection);
  context.inboxes.open('main', NEVER_CLOSED);
  context.subagents.start('sub', 'main', connection);
  context.subagents.attach('sub');
  context.inboxes.open('sub', NEVER_CLOSED);
};

/**
 * Returns the identifiers of the sessions of every message of the log of `context`, in the order of the log.
 */
const loggedSessions = async (context: MethodContext): Promise<readonly string[]> =>
  (await context.messageLog.list({ sessionId: undefined, alias: undefined, after: 0, limit: 100 })).map(
    ({ sessionId }) => sessionId,
  );

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('sessionDeleteMethod', () => {
  it('deletes the subagent with its messages', async () => {
    const context = await registeredContext();
    await testCall(sessionDeleteMethod, { sessionId: 'sub' }, context);
    assert.equal(await context.sessions.get('sub'), undefined);
    assert.deepEqual(await loggedSessions(context), ['main']);
  });

  it('stops a started subagent first, with a request to stop its background task', async () => {
    const context = await registeredContext();
    const connection = testConnection();
    connection.answer('subagentTaskId', { backgroundTaskId: 'task-7' });
    startSubagent(context, connection);
    await testCall(sessionDeleteMethod, { sessionId: 'sub' }, context);
    assert.deepEqual([context.subagents.list(), context.inboxes.find('sub')], [[], undefined]);
    const delivery = await context.inboxes.take('main', 0);
    const [message] = delivery.status === 'messages' ? delivery.messages : [];
    assert.match(message?.content ?? '', /Call the TaskStop tool with task_id "task-7"/);
  });

  it('stops and deletes a started subagent when the request to its orchestrator fails', async () => {
    const context = await registeredContext();
    const failing: RpcConnection = {
      ...testConnection(),
      request: async () => {
        throw new Error('The session server is gone');
      },
    };
    startSubagent(context, failing);
    await testCall(sessionDeleteMethod, { sessionId: 'sub' }, context);
    assert.deepEqual([context.subagents.list(), context.inboxes.find('sub')], [[], undefined]);
    assert.equal(await context.sessions.get('sub'), undefined);
  });

  it('rejects an orchestrator session with invalid parameters, and keeps it', async () => {
    const context = await registeredContext();
    await assert.rejects(testCall(sessionDeleteMethod, { sessionId: 'main' }, context), {
      ...INVALID_PARAMS,
      message: 'Session main is no subagent, so it cannot be deleted',
    });
    assert.equal((await context.sessions.get('main'))?.id, 'main');
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(testCall(sessionDeleteMethod, { sessionId: 'other' }, await registeredContext()), {
      ...INVALID_PARAMS,
      message: 'No session other is registered',
    });
  });
});
