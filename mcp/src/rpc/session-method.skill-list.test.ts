import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testSessionMethodContext } from '../testing/test-session-method-context.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';
import { skillListSessionMethod } from './session-method.skill-list.ts';

/**
 * Skill that the agent of the session of the tests can run.
 */
const PLAN_SKILL = { name: 'atomic-workflow:plan', description: 'Plans a task.' };

describe('skillListSessionMethod', () => {
  it('returns the skills that the transcript of the session lists', async () => {
    const context = testSessionMethodContext({ listSkills: (sessionId) => (sessionId === 'main' ? [PLAN_SKILL] : []) });
    assert.deepEqual(await testCall(skillListSessionMethod, { sessionId: 'main' }, context), { skills: [PLAN_SKILL] });
  });

  it('rejects as the list of the skills does for a session that the agent does not run now', async () => {
    const context = testSessionMethodContext({
      listSkills: () => {
        throw new Error('The agent does not run the session other');
      },
    });
    await assert.rejects(testCall(skillListSessionMethod, { sessionId: 'other' }, context), {
      name: 'Error',
      message: 'The agent does not run the session other',
    });
  });

  it('rejects an empty session id with invalid parameters', async () => {
    await assert.rejects(testCall(skillListSessionMethod, { sessionId: '' }, testSessionMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
