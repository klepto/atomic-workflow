import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { repositoryGetMethod } from './method.repository-get.ts';

describe('repositoryGetMethod', () => {
  it('returns the main worktree with its last segment as the name', async () => {
    const context = testMethodContext({ mainWorktree: 'C:/dev/atomic-workflow-mcp' });
    assert.deepEqual(await testCall(repositoryGetMethod, {}, context), {
      name: 'atomic-workflow-mcp',
      directory: 'C:/dev/atomic-workflow-mcp',
    });
  });

  it('takes a call without parameters', async () => {
    assert.deepEqual(await testCall(repositoryGetMethod, undefined, testMethodContext()), {
      name: 'repository',
      directory: '/repository',
    });
  });
});
