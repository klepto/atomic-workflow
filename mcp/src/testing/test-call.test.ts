import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import type { Method } from '../rpc/method.ts';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';
import { testCall } from './test-call.ts';

/**
 * Schema of the parameters of the method of the tests.
 */
const PARAMS = z.object({ count: z.number().int().default(1) });

/**
 * Returns a method of the tests that records the params and the context of each call of `handle` in `calls`, and
 * returns twice the count.
 */
const doubleMethod = (calls: unknown[][]): Method<typeof PARAMS, number, string> => ({
  name: 'double',
  description: 'Returns twice the count.',
  agent: false,
  params: PARAMS,
  handle: async (params, context) => {
    calls.push([params, context]);
    return params.count * 2;
  },
});

describe('testCall', () => {
  it('returns the result of handle for params that fit the schema', async () => {
    assert.equal(await testCall(doubleMethod([]), { count: 4 }, 'context'), 8);
  });

  it('passes the parsed params and the context to handle', async () => {
    const calls: unknown[][] = [];
    await testCall(doubleMethod(calls), {}, 'context');
    assert.deepEqual(calls, [[{ count: 1 }, 'context']]);
  });

  it('parses missing params as an empty object', async () => {
    assert.equal(await testCall(doubleMethod([]), undefined, 'context'), 2);
  });

  it('rejects params that do not fit the schema with the RpcError of INVALID_PARAMS', async () => {
    await assert.rejects(
      testCall(doubleMethod([]), { count: 'four' }, 'context'),
      (error) => error instanceof RpcError && error.code === RPC_ERROR_CODES.INVALID_PARAMS,
    );
  });

  it('does not call handle for params that do not fit the schema', async () => {
    const calls: unknown[][] = [];
    await assert.rejects(testCall(doubleMethod(calls), { count: 1.5 }, 'context'), RpcError);
    assert.deepEqual(calls, []);
  });

  it('rejects with the failure of handle', async () => {
    const method: Method<typeof PARAMS, number, string> = {
      ...doubleMethod([]),
      handle: async () => {
        throw new RpcError(7, 'The count is too large');
      },
    };
    await assert.rejects(testCall(method, {}, 'context'), { name: 'RpcError', code: 7 });
  });
});
