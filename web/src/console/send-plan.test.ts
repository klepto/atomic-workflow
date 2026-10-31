import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Skill } from '@/api/types.ts';
import { planSend } from '@/console/send-plan.ts';

/**
 * Skills of the session of the chat.
 */
const SKILLS: readonly Skill[] = [{ name: 'atomic-workflow:plan', description: 'Plans a task' }];

describe('planSend', () => {
  it('delivers a text that runs no skill as it is', () => {
    assert.deepEqual(planSend('Hello', 'orchestrator', SKILLS), { route: 'deliver', text: 'Hello' });
    assert.deepEqual(planSend('/compact', 'subagent', SKILLS), { route: 'deliver', text: '/compact' });
  });

  it('starts a subagent with the whole name of the skill from the chat of the main session', () => {
    assert.deepEqual(planSend('/plan 3', 'orchestrator', SKILLS), {
      route: 'subagent',
      text: '/atomic-workflow:plan 3',
    });
  });

  it('delivers the whole name of the skill from the chat of a subagent', () => {
    assert.deepEqual(planSend('  /plan 3', 'subagent', SKILLS), { route: 'deliver', text: '/atomic-workflow:plan 3' });
  });

  it('delivers every text as it is without skills', () => {
    assert.deepEqual(planSend('/plan 3', 'orchestrator', []), { route: 'deliver', text: '/plan 3' });
  });
});
