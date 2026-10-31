import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { messageLogMethod } from './method.message-log.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

/**
 * Returns a context with the clock at 50, in which the orchestrator session `main` is registered.
 */
const registeredContext = async (): Promise<MethodContext> => {
  const context = testMethodContext({ clock: testClock(50) });
  const main = { id: 'main', agent: 'claude', directory: '/repository', startedAt: 0, role: 'orchestrator' } as const;
  await context.sessions.register(newSession({ ...main, parentId: null }));
  return context;
};

/**
 * Returns every message of the log of `context`.
 */
const loggedMessages = async (context: MethodContext) =>
  context.messageLog.list({ sessionId: undefined, alias: undefined, after: 0, limit: 100 });

describe('messageLogMethod', () => {
  it('logs the message and returns it with its identifier', async () => {
    const context = await registeredContext();
    const params = { sessionId: 'main', messageId: 'm-1', sender: 'agent', content: 'Done.', timestamp: 20 };
    const expected = { id: 1, sessionId: 'main', messageId: 'm-1', sender: 'agent', content: 'Done.', timestamp: 20 };
    assert.deepEqual(await testCall(messageLogMethod, params, context), expected);
    assert.deepEqual(await loggedMessages(context), [expected]);
  });

  it('gives a message without a time the time of the call, and without a message id null', async () => {
    const context = await registeredContext();
    const message = await testCall(messageLogMethod, { sessionId: 'main', sender: 'user', content: 'Go' }, context);
    assert.deepEqual([message.timestamp, message.messageId], [50, null]);
  });

  it('does not log a message with the message id of a logged message again', async () => {
    const context = await registeredContext();
    const params = { sessionId: 'main', messageId: 'm-1', sender: 'agent', content: 'Done.' };
    const first = await testCall(messageLogMethod, params, context);
    const second = await testCall(messageLogMethod, { ...params, content: 'Again.' }, context);
    assert.deepEqual([second, (await loggedMessages(context)).length], [first, 1]);
  });

  it('rejects a message of a session that is not registered with invalid parameters', async () => {
    const context = await registeredContext();
    const params = { sessionId: 'other', sender: 'user', content: 'Go' };
    await assert.rejects(testCall(messageLogMethod, params, context), {
      ...INVALID_PARAMS,
      message: 'No session other is registered',
    });
    assert.deepEqual(await loggedMessages(context), []);
  });

  it('rejects a sender that is neither user nor agent with invalid parameters', async () => {
    const params = { sessionId: 'main', sender: 'server', content: 'Go' };
    await assert.rejects(testCall(messageLogMethod, params, await registeredContext()), INVALID_PARAMS);
  });
});
