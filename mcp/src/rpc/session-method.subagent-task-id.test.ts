import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testSessionMethodContext } from '../testing/test-session-method-context.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';
import { subagentTaskIdSessionMethod } from './session-method.subagent-task-id.ts';

describe('subagentTaskIdSessionMethod', () => {
  it('returns the id of the background task that runs the subagent', async () => {
    const context = testSessionMethodContext({ subagentTaskId: (sessionId) => `task-of-${sessionId}` });
    assert.deepEqual(await testCall(subagentTaskIdSessionMethod, { sessionId: 'sub' }, context), {
      backgroundTaskId: 'task-of-sub',
    });
  });

  it('returns null while the session server knows no background task of the subagent', async () => {
    assert.deepEqual(await testCall(subagentTaskIdSessionMethod, { sessionId: 'sub' }, testSessionMethodContext()), {
      backgroundTaskId: null,
    });
  });

  it('rejects an empty session id with invalid parameters', async () => {
    await assert.rejects(testCall(subagentTaskIdSessionMethod, { sessionId: '' }, testSessionMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
