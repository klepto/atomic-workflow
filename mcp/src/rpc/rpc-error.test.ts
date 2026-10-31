import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

describe('RPC_ERROR_CODES', () => {
  it('holds the codes that JSON-RPC 2.0 defines', () => {
    assert.deepEqual(RPC_ERROR_CODES, {
      PARSE_ERROR: -32700,
      INVALID_REQUEST: -32600,
      METHOD_NOT_FOUND: -32601,
      INVALID_PARAMS: -32602,
      INTERNAL_ERROR: -32603,
    });
  });
});

describe('RpcError', () => {
  it('holds its code, its message and its data', () => {
    const error = new RpcError(7, 'The count is too large', { limit: 3 });
    assert.equal(error.code, 7);
    assert.equal(error.message, 'The count is too large');
    assert.deepEqual(error.data, { limit: 3 });
  });

  it('is an Error named RpcError', () => {
    const error = new RpcError(7, 'The count is too large');
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'RpcError');
  });

  it('has no data when none is given', () => {
    assert.equal(new RpcError(7, 'The count is too large').data, undefined);
  });

  it('builds the failure that an error object reports', () => {
    const error = RpcError.of({ code: -32602, message: 'The task is missing', data: ['task'] });
    assert.ok(error instanceof RpcError);
    assert.equal(error.code, -32602);
    assert.equal(error.message, 'The task is missing');
    assert.deepEqual(error.data, ['task']);
  });

  it('builds the response to a request that reports the failure', () => {
    assert.deepEqual(new RpcError(7, 'The count is too large', { limit: 3 }).toResponse(4), {
      jsonrpc: '2.0',
      id: 4,
      error: { code: 7, message: 'The count is too large', data: { limit: 3 } },
    });
  });

  it('builds a response with the id null for a request without a valid id', () => {
    assert.equal(new RpcError(RPC_ERROR_CODES.PARSE_ERROR, 'Unexpected token').toResponse(null).id, null);
  });

  it('builds a response that JSON writes without data when it has none', () => {
    const response = new RpcError(7, 'The count is too large').toResponse('a');
    assert.deepEqual(JSON.parse(JSON.stringify(response)), {
      jsonrpc: '2.0',
      id: 'a',
      error: { code: 7, message: 'The count is too large' },
    });
  });
});
