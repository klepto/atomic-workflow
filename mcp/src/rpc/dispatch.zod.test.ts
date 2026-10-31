import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { zodDispatch } from './dispatch.zod.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Schema of the parameters of the methods of the tests.
 */
const PARAMS = z.object({ count: z.number().int().default(1) });

/**
 * Context of the methods of the tests: the counts that each call of `double` received.
 */
type Calls = number[];

/**
 * Method of the tests that records the count of each call in the context, and returns twice the count.
 */
const DOUBLE: Method<typeof PARAMS, number, Calls> = {
  name: 'double',
  description: 'Returns twice the count.',
  agent: false,
  params: PARAMS,
  handle: async ({ count }, calls) => {
    calls.push(count);
    return count * 2;
  },
};

/**
 * Returns a method of the tests named `name`, whose `handle` runs `handle`.
 */
const method = (name: string, handle: () => Promise<unknown>): Method<typeof PARAMS, unknown, Calls> => ({
  name,
  description: 'Runs a step of a test.',
  agent: false,
  params: PARAMS,
  handle,
});

/**
 * Methods of the tests: `double`, `nothing` that returns `undefined`, `refuse` that throws an `RpcError` with data,
 * and `crash` that throws another error.
 */
const METHODS = [
  DOUBLE,
  method('nothing', async () => undefined),
  method('refuse', async () => {
    throw new RpcError(7, 'The count is too large', { limit: 3 });
  }),
  method('crash', async () => {
    throw new Error('The disk is full');
  }),
];

describe('zodDispatch', () => {
  it('answers a request with the result of its method and its id', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 4, method: 'double', params: { count: 3 } });
    assert.deepEqual(response, { jsonrpc: '2.0', id: 4, result: 6 });
  });

  it('keeps an id that is a string', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 'a', method: 'double' });
    assert.deepEqual(response, { jsonrpc: '2.0', id: 'a', result: 2 });
  });

  it('passes the parsed params and the context to the method, with missing params as an empty object', async () => {
    const calls: Calls = [];
    await zodDispatch(METHODS, calls, { jsonrpc: '2.0', id: 1, method: 'double' });
    assert.deepEqual(calls, [1]);
  });

  it('answers a result of undefined with null', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 1, method: 'nothing' });
    assert.deepEqual(response, { jsonrpc: '2.0', id: 1, result: null });
  });

  it('runs a notification and answers it with undefined', async () => {
    const calls: Calls = [];
    const response = await zodDispatch(METHODS, calls, { jsonrpc: '2.0', method: 'double', params: { count: 5 } });
    assert.equal(response, undefined);
    assert.deepEqual(calls, [5]);
  });

  it('answers a notification of a method that fails with undefined', async () => {
    assert.equal(await zodDispatch(METHODS, [], { jsonrpc: '2.0', method: 'crash' }), undefined);
  });

  it('answers a request of an unknown method with METHOD_NOT_FOUND', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 2, method: 'triple' });
    assert.deepEqual(response, {
      jsonrpc: '2.0',
      id: 2,
      error: { code: RPC_ERROR_CODES.METHOD_NOT_FOUND, message: 'Unknown method triple' },
    });
  });

  it('answers invalid params with INVALID_PARAMS without a call of the method', async () => {
    const calls: Calls = [];
    const response = await zodDispatch(METHODS, calls, {
      jsonrpc: '2.0',
      id: 3,
      method: 'double',
      params: { count: 'two' },
    });
    assert.ok(response !== undefined && 'error' in response);
    assert.equal(response.id, 3);
    assert.equal(response.error.code, RPC_ERROR_CODES.INVALID_PARAMS);
    assert.match(response.error.message, /count/);
    assert.deepEqual(calls, []);
  });

  it('answers a method that throws an RpcError with its code, message and data', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 5, method: 'refuse' });
    assert.deepEqual(response, {
      jsonrpc: '2.0',
      id: 5,
      error: { code: 7, message: 'The count is too large', data: { limit: 3 } },
    });
  });

  it('answers a method that throws another error with INTERNAL_ERROR and its message', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: 6, method: 'crash' });
    assert.deepEqual(response, {
      jsonrpc: '2.0',
      id: 6,
      error: { code: RPC_ERROR_CODES.INTERNAL_ERROR, message: 'The disk is full' },
    });
  });

  it('answers a message without the version 2.0 with INVALID_REQUEST and its id', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '1.0', id: 8, method: 'double' });
    assert.deepEqual(response, {
      jsonrpc: '2.0',
      id: 8,
      error: { code: RPC_ERROR_CODES.INVALID_REQUEST, message: 'Invalid request', data: undefined },
    });
  });

  it('answers a message that is not an object with INVALID_REQUEST and the id null', async () => {
    const response = await zodDispatch(METHODS, [], 'double');
    assert.deepEqual(response, {
      jsonrpc: '2.0',
      id: null,
      error: { code: RPC_ERROR_CODES.INVALID_REQUEST, message: 'Invalid request', data: undefined },
    });
  });

  it('answers a batch with INVALID_REQUEST and the id null', async () => {
    const response = await zodDispatch(METHODS, [], [{ jsonrpc: '2.0', id: 1, method: 'double' }]);
    assert.ok(response !== undefined && 'error' in response);
    assert.equal(response.id, null);
    assert.equal(response.error.code, RPC_ERROR_CODES.INVALID_REQUEST);
  });

  it('answers an invalid request whose id is neither a string nor a number with the id null', async () => {
    const response = await zodDispatch(METHODS, [], { jsonrpc: '2.0', id: true, method: 'double' });
    assert.ok(response !== undefined && 'error' in response);
    assert.equal(response.id, null);
    assert.equal(response.error.code, RPC_ERROR_CODES.INVALID_REQUEST);
  });
});
