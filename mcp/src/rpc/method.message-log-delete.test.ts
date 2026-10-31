import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { messageLogDeleteMethod } from './method.message-log-delete.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Returns a context in which the orchestrator sessions `main` and `other` are registered, with two messages of `main`
 * and one of `other` in the log.
 */
const loggedContext = async (): Promise<MethodContext> => {
  const context = testMethodContext();
  const base = {
    agent: 'claude',
    directory: '/repository',
    startedAt: 0,
    role: 'orchestrator',
    parentId: null,
  } as const;
  await context.sessions.register(newSession({ ...base, id: 'main' }));
  await context.sessions.register(newSession({ ...base, id: 'other' }));
  for (const sessionId of ['main', 'main', 'other'])
    await context.messageLog.append({ sessionId, messageId: null, sender: 'user', content: 'Go', timestamp: 1 });
  return context;
};

/**
 * Returns the identifiers of the sessions of every message of the log of `context`, in the order of the log.
 */
const loggedSessions = async (context: MethodContext): Promise<readonly string[]> =>
  (await context.messageLog.list({ sessionId: undefined, alias: undefined, after: 0, limit: 100 })).map(
    ({ sessionId }) => sessionId,
  );

describe('messageLogDeleteMethod', () => {
  it('deletes every message of the session and returns how many it deleted', async () => {
    const context = await loggedContext();
    assert.deepEqual(await testCall(messageLogDeleteMethod, { sessionId: 'main' }, context), { deleted: 2 });
    assert.deepEqual(await loggedSessions(context), ['other']);
  });

  it('keeps the session registered', async () => {
    const context = await loggedContext();
    await testCall(messageLogDeleteMethod, { sessionId: 'main' }, context);
    assert.equal((await context.sessions.get('main'))?.id, 'main');
  });

  it('returns 0 for a session with no message', async () => {
    const context = await loggedContext();
    await testCall(messageLogDeleteMethod, { sessionId: 'main' }, context);
    assert.deepEqual(await testCall(messageLogDeleteMethod, { sessionId: 'main' }, context), { deleted: 0 });
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(testCall(messageLogDeleteMethod, { sessionId: 'sub' }, await loggedContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session sub is registered',
    });
  });
});
