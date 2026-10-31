import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { messageDeliverMethod } from './method.message-deliver.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

/**
 * Returns a context with the clock at 30, in which the orchestrator session `main` is registered, with an open inbox
 * when `withInbox` is true.
 */
const registeredContext = async (withInbox: boolean): Promise<MethodContext> => {
  const context = testMethodContext({ clock: testClock(30) });
  const main = { id: 'main', agent: 'claude', directory: '/repository', startedAt: 0, role: 'orchestrator' } as const;
  await context.sessions.register(newSession({ ...main, parentId: null }));
  if (withInbox) context.inboxes.open('main', new Promise(() => undefined));
  return context;
};

/**
 * Returns every message of the log of `context`.
 */
const loggedMessages = async (context: MethodContext) =>
  context.messageLog.list({ sessionId: undefined, alias: undefined, after: 0, limit: 100 });

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('messageDeliverMethod', () => {
  it('puts the message into the inbox of the session', async () => {
    const context = await registeredContext(true);
    await testCall(messageDeliverMethod, { sessionId: 'main', content: 'Plan the cache' }, context);
    assert.deepEqual(await context.inboxes.take('main', 0), {
      status: 'messages',
      sessionId: 'main',
      messages: [{ id: 1, content: 'Plan the cache' }],
    });
  });

  it('logs the message as a message of the user at the time of the call', async () => {
    const context = await registeredContext(true);
    await testCall(messageDeliverMethod, { sessionId: 'main', content: 'Plan the cache' }, context);
    assert.deepEqual(await loggedMessages(context), [
      { id: 1, sessionId: 'main', messageId: null, sender: 'user', content: 'Plan the cache', timestamp: 30 },
    ]);
  });

  it('rejects a session without an inbox with invalid parameters, and logs nothing', async () => {
    const context = await registeredContext(false);
    await assert.rejects(testCall(messageDeliverMethod, { sessionId: 'main', content: 'Plan the cache' }, context), {
      ...INVALID_PARAMS,
      message: 'No session main is attached',
    });
    assert.deepEqual(await loggedMessages(context), []);
  });

  it('rejects an empty message with invalid parameters', async () => {
    const context = await registeredContext(true);
    await assert.rejects(testCall(messageDeliverMethod, { sessionId: 'main', content: '' }, context), INVALID_PARAMS);
  });
});
