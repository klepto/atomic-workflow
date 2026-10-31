import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionAliasSetMethod } from './method.session-alias-set.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

/**
 * Returns a context in which the orchestrator session `main` of the alias `main` and its subagent `sub` with no alias
 * are registered, neither attached.
 */
const registeredContext = async (): Promise<MethodContext> => {
  const context = testMethodContext();
  const base = { agent: 'claude', directory: '/repository', startedAt: 0 } as const;
  await context.sessions.register(
    newSession({ ...base, id: 'main', role: 'orchestrator', parentId: null, alias: 'main' }),
  );
  await context.sessions.register(newSession({ ...base, id: 'sub', role: 'subagent', parentId: 'main' }));
  return context;
};

/**
 * Returns the alias of the session `sessionId` of `context`.
 */
const aliasOf = async (sessionId: string, context: MethodContext): Promise<string | null | undefined> =>
  (await context.sessions.get(sessionId))?.alias;

describe('sessionAliasSetMethod', () => {
  it('sets the alias of a subagent that has ended', async () => {
    const context = await registeredContext();
    await testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'Cache planner' }, context);
    assert.equal(await aliasOf('sub', context), 'Cache planner');
  });

  it('keeps the alias main of an orchestrator session', async () => {
    const context = await registeredContext();
    await testCall(sessionAliasSetMethod, { sessionId: 'main', alias: 'main' }, context);
    assert.equal(await aliasOf('main', context), 'main');
  });

  it('rejects any other alias of an orchestrator session, or none, with invalid parameters', async () => {
    const context = await registeredContext();
    for (const alias of ['Main chat', null])
      await assert.rejects(testCall(sessionAliasSetMethod, { sessionId: 'main', alias }, context), {
        ...INVALID_PARAMS,
        message: 'An orchestrator session holds the alias main only',
      });
    assert.equal(await aliasOf('main', context), 'main');
  });

  it('rejects the alias main of a subagent with invalid parameters', async () => {
    const context = await registeredContext();
    await assert.rejects(testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'main' }, context), {
      ...INVALID_PARAMS,
      message: 'The alias main is reserved for orchestrator sessions',
    });
    assert.equal(await aliasOf('sub', context), null);
  });

  it('clears the alias for null', async () => {
    const context = await registeredContext();
    await testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'Cache planner' }, context);
    await testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: null }, context);
    assert.equal(await aliasOf('sub', context), null);
  });

  it('accepts an alias of 60 characters', async () => {
    const context = await registeredContext();
    await testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'a'.repeat(60) }, context);
    assert.equal(await aliasOf('sub', context), 'a'.repeat(60));
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(
      testCall(sessionAliasSetMethod, { sessionId: 'other', alias: 'Other' }, await registeredContext()),
      {
        ...INVALID_PARAMS,
        message: 'No session other is registered',
      },
    );
  });

  it('rejects an alias with a line break with invalid parameters', async () => {
    const context = await registeredContext();
    await assert.rejects(
      testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'Cache\nplanner' }, context),
      INVALID_PARAMS,
    );
    assert.equal(await aliasOf('sub', context), null);
  });

  it('rejects an alias longer than 60 characters with invalid parameters', async () => {
    const context = await registeredContext();
    await assert.rejects(
      testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: 'a'.repeat(61) }, context),
      INVALID_PARAMS,
    );
  });

  it('rejects an empty alias with invalid parameters', async () => {
    const context = await registeredContext();
    await assert.rejects(testCall(sessionAliasSetMethod, { sessionId: 'sub', alias: '' }, context), INVALID_PARAMS);
  });
});
