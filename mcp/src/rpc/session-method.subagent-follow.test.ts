import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testSessionMethodContext } from '../testing/test-session-method-context.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';
import { subagentFollowSessionMethod } from './session-method.subagent-follow.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Returns a `SessionMethodContext` that records the arguments of each call of `followSubagent` in `calls`.
 */
const recordingContext = (calls: unknown[][]): SessionMethodContext =>
  testSessionMethodContext({
    followSubagent: (...args) => {
      calls.push(args);
    },
  });

describe('subagentFollowSessionMethod', () => {
  it('follows a subagent that is no one-shot subagent when oneShot is left out', async () => {
    const calls: unknown[][] = [];
    const params = { sessionId: 'sub', parentId: 'main' };
    const result = await testCall(subagentFollowSessionMethod, params, recordingContext(calls));
    assert.deepEqual([result, calls], [undefined, [['sub', 'main', false]]]);
  });

  it('follows a one-shot subagent', async () => {
    const calls: unknown[][] = [];
    const params = { sessionId: 'sub', parentId: 'main', oneShot: true };
    await testCall(subagentFollowSessionMethod, params, recordingContext(calls));
    assert.deepEqual(calls, [['sub', 'main', true]]);
  });

  it('rejects as the follow does for a parent that the agent does not run now', async () => {
    const context = testSessionMethodContext({
      followSubagent: () => {
        throw new Error('The agent does not run the session other');
      },
    });
    await assert.rejects(testCall(subagentFollowSessionMethod, { sessionId: 'sub', parentId: 'other' }, context), {
      name: 'Error',
      message: 'The agent does not run the session other',
    });
  });

  it('rejects a call without a parent with invalid parameters', async () => {
    await assert.rejects(testCall(subagentFollowSessionMethod, { sessionId: 'sub' }, testSessionMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
