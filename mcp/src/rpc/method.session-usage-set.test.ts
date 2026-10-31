import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionUsageSetMethod } from './method.session-usage-set.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Usage of the newest model request of the session of the tests.
 */
const USAGE = { contextTokens: 12_000, model: 'claude-opus-5-5', effort: 'xhigh' };

/**
 * Returns a context in which the orchestrator session `main` is registered.
 */
const registeredContext = async (): Promise<MethodContext> => {
  const context = testMethodContext();
  const main = { id: 'main', agent: 'claude', directory: '/repository', startedAt: 0, role: 'orchestrator' } as const;
  await context.sessions.register(newSession({ ...main, parentId: null }));
  return context;
};

describe('sessionUsageSetMethod', () => {
  it('stores the context size, the model and the effort with the session', async () => {
    const context = await registeredContext();
    await testCall(sessionUsageSetMethod, { sessionId: 'main', ...USAGE }, context);
    const session = await context.sessions.get('main');
    assert.deepEqual([session?.contextTokens, session?.model, session?.effort], [12_000, 'claude-opus-5-5', 'xhigh']);
  });

  it('stores a model and an effort that are not known as null', async () => {
    const context = await registeredContext();
    await testCall(sessionUsageSetMethod, { sessionId: 'main', ...USAGE }, context);
    await testCall(sessionUsageSetMethod, { sessionId: 'main', contextTokens: 0, model: null, effort: null }, context);
    const session = await context.sessions.get('main');
    assert.deepEqual([session?.contextTokens, session?.model, session?.effort], [0, null, null]);
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(testCall(sessionUsageSetMethod, { sessionId: 'other', ...USAGE }, await registeredContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session other is registered',
    });
  });

  it('rejects a negative context size with invalid parameters', async () => {
    const params = { sessionId: 'main', ...USAGE, contextTokens: -1 };
    await assert.rejects(testCall(sessionUsageSetMethod, params, await registeredContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
