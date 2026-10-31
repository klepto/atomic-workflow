import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { skillListMethod } from './method.skill-list.ts';
import type { MethodContext } from './method.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Skill that plans a task.
 */
const PLAN_SKILL = { name: 'atomic-workflow:plan', description: 'Plans a task.' };

/**
 * Skill that implements a ticket.
 */
const IMPLEMENT_SKILL = { name: 'atomic-workflow:implement', description: 'Implements a ticket.' };

/**
 * Returns a connection whose session server lists the skill that attaches a session among its skills.
 */
const skillConnection = (): TestConnection => {
  const connection = testConnection();
  const activation = { name: 'atomic-workflow:atomic-workflow', description: 'Attaches the session.' };
  connection.answer('skillList', { skills: [PLAN_SKILL, activation, IMPLEMENT_SKILL] });
  return connection;
};

/**
 * Returns a context in which the orchestrator session `main` is bound to `connection`, with its started subagent
 * `sub`, attached unless `attached` is false.
 */
const skillContext = (connection: RpcConnection, attached = true): MethodContext => {
  const context = testMethodContext();
  context.sessionConnections.bind('main', connection);
  context.subagents.start('sub', 'main', connection);
  if (attached) context.subagents.attach('sub');
  return context;
};

describe('skillListMethod', () => {
  it('returns the skills of a bound session without the skill that attaches a session', async () => {
    const context = skillContext(skillConnection());
    assert.deepEqual(await testCall(skillListMethod, { sessionId: 'main' }, context), {
      skills: [PLAN_SKILL, IMPLEMENT_SKILL],
    });
  });

  it('asks the session server of the orchestrator for the skills of a subagent', async () => {
    const connection = skillConnection();
    const result = await testCall(skillListMethod, { sessionId: 'sub' }, skillContext(connection));
    assert.deepEqual(result, { skills: [PLAN_SKILL, IMPLEMENT_SKILL] });
    assert.deepEqual(connection.requests, [{ method: 'skillList', params: { sessionId: 'main' } }]);
  });

  it('rejects a session that is not attached with invalid parameters', async () => {
    await assert.rejects(testCall(skillListMethod, { sessionId: 'other' }, skillContext(skillConnection())), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session other is attached',
    });
  });

  it('rejects a subagent that has not attached yet with invalid parameters', async () => {
    await assert.rejects(testCall(skillListMethod, { sessionId: 'sub' }, skillContext(skillConnection(), false)), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session sub is attached',
    });
  });

  it('rejects as the request to the session server does', async () => {
    const failing: RpcConnection = {
      ...testConnection(),
      request: async () => {
        throw new Error('The session server is gone');
      },
    };
    await assert.rejects(testCall(skillListMethod, { sessionId: 'main' }, skillContext(failing)), {
      name: 'Error',
      message: 'The session server is gone',
    });
  });
});
