import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testSessionMethodContext } from './test-session-method-context.ts';

describe('testSessionMethodContext', () => {
  it('lists no skill and knows no background task by default', () => {
    const context = testSessionMethodContext();
    assert.deepEqual([context.listSkills('main'), context.subagentTaskId('sub')], [[], undefined]);
  });

  it('follows a subagent without a failure by default', () => {
    assert.equal(testSessionMethodContext().followSubagent('sub', 'main', false), undefined);
  });

  it('replaces each default by the field of the overrides', () => {
    const context = testSessionMethodContext({ subagentTaskId: () => 'task-7' });
    assert.equal(context.subagentTaskId('sub'), 'task-7');
  });
});
