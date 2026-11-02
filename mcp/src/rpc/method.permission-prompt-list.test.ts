import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { permissionPromptListMethod } from './method.permission-prompt-list.ts';

/**
 * Promise of a client that never goes away on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

describe('permissionPromptListMethod', () => {
  it('returns no prompt while none is open', async () => {
    assert.deepEqual(await testCall(permissionPromptListMethod, {}, testMethodContext()), { prompts: [] });
  });

  it('returns every open prompt with each of its fields, the oldest first', async () => {
    const context = testMethodContext();
    const first = context.prompts.open(
      {
        sessionId: 'main',
        agentType: null,
        toolName: 'Bash',
        toolInput: { command: 'ls' },
        suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'ls' }] }],
        openedAt: 10,
      },
      NEVER_CLOSED,
    ).prompt;
    const second = context.prompts.open(
      { sessionId: 'sub', agentType: 'worker', toolName: 'Edit', toolInput: {}, suggestions: [], openedAt: 20 },
      NEVER_CLOSED,
    ).prompt;
    assert.deepEqual(await testCall(permissionPromptListMethod, {}, context), { prompts: [first, second] });
  });

  it('is no agent tool', () => {
    assert.equal(permissionPromptListMethod.agent, false);
  });
});
