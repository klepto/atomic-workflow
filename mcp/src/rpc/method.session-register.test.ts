import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionRegisterMethod } from './method.session-register.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Parameters of the registration of the orchestrator session `main`.
 */
const MAIN = { sessionId: 'main', agent: 'claude', directory: '/repository' };

/**
 * Failure of a call with parameters that do not fit the method.
 */
const INVALID_PARAMS = { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS };

describe('sessionRegisterMethod', () => {
  it('registers an orchestrator session of the alias main that started at the time of the call, with no work', async () => {
    const context = testMethodContext({ clock: testClock(1_000) });
    const expected = {
      id: 'main',
      agent: 'claude',
      directory: '/repository',
      startedAt: 1_000,
      role: 'orchestrator',
      parentId: null,
      taskId: null,
      job: null,
      ticketId: null,
      alias: 'main',
      contextTokens: null,
      model: null,
      effort: null,
    };
    assert.deepEqual(await testCall(sessionRegisterMethod, MAIN, context), expected);
    assert.deepEqual(await context.sessions.get('main'), expected);
  });

  it('keeps the start time that the call gives', async () => {
    const session = await testCall(sessionRegisterMethod, { ...MAIN, startedAt: 42 }, testMethodContext());
    assert.equal(session.startedAt, 42);
  });

  it('registers a subagent inside its orchestrator session', async () => {
    const context = testMethodContext();
    await testCall(sessionRegisterMethod, MAIN, context);
    const params = { sessionId: 'sub', agent: 'codex', directory: '/repository', role: 'subagent', parentId: 'main' };
    const session = await testCall(sessionRegisterMethod, params, context);
    assert.deepEqual([session.agent, session.role, session.parentId], ['codex', 'subagent', 'main']);
  });

  it('returns a session that is registered already as it is', async () => {
    const context = testMethodContext();
    await testCall(sessionRegisterMethod, { ...MAIN, startedAt: 1 }, context);
    await context.sessions.setAlias('main', 'Planner');
    const session = await testCall(sessionRegisterMethod, { ...MAIN, startedAt: 2 }, context);
    assert.deepEqual([session.startedAt, session.alias], [1, 'Planner']);
  });

  it('forgets the activity that the session reported before', async () => {
    const context = testMethodContext();
    context.activity.report('main', 'working', 5);
    await testCall(sessionRegisterMethod, MAIN, context);
    assert.equal(context.activity.get('main'), undefined);
  });

  it('rejects an agent that is neither claude nor codex with invalid parameters', async () => {
    await assert.rejects(
      testCall(sessionRegisterMethod, { ...MAIN, agent: 'gemini' }, testMethodContext()),
      INVALID_PARAMS,
    );
  });

  it('rejects an empty session id with invalid parameters', async () => {
    await assert.rejects(
      testCall(sessionRegisterMethod, { ...MAIN, sessionId: '' }, testMethodContext()),
      INVALID_PARAMS,
    );
  });
});
