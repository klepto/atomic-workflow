import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { echoMethod } from './method.echo.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

describe('echoMethod', () => {
  it('returns the message that it receives', async () => {
    assert.deepEqual(await testCall(echoMethod, { message: 'ping' }, testMethodContext()), { message: 'ping' });
  });

  it('rejects a message that is no string with invalid parameters', async () => {
    await assert.rejects(testCall(echoMethod, { message: 1 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
