import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RpcCallError, resultOf } from '@/api/rpc.ts';

describe('RpcCallError', () => {
  it('holds the message and the details of the error', () => {
    const error = new RpcCallError('The task is unknown', { kind: 'unknown' });
    assert.equal(error instanceof Error, true);
    assert.equal(error.name, 'RpcCallError');
    assert.equal(error.message, 'The task is unknown');
    assert.deepEqual(error.data, { kind: 'unknown' });
  });
});

describe('resultOf', () => {
  it('returns the result of a response', () => {
    assert.deepEqual(resultOf({ jsonrpc: '2.0', id: 1, result: { tasks: [] } }, 'taskList'), { tasks: [] });
  });

  it('returns a result that is null', () => {
    assert.equal(resultOf({ jsonrpc: '2.0', id: 1, result: null }, 'taskList'), null);
  });

  it('throws an RpcCallError with the message and the details of an error', () => {
    const body = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Conflict', data: { kind: 'conflict' } } };
    assert.throws(() => resultOf(body, 'worktreeMerge'), {
      name: 'RpcCallError',
      message: 'Conflict',
      data: { kind: 'conflict' },
    });
  });

  it('throws an RpcCallError with a message of its own for an error without a message', () => {
    assert.throws(() => resultOf({ error: { code: -32000 } }, 'worktreeMerge'), {
      name: 'RpcCallError',
      message: 'The server answered worktreeMerge with an error without a message',
      data: undefined,
    });
  });

  it('throws an Error for a body that is no object', () => {
    assert.throws(() => resultOf('busy', 'taskList'), {
      name: 'Error',
      message: 'The server answered taskList with no JSON-RPC response',
    });
    assert.throws(() => resultOf(null, 'taskList'), {
      message: 'The server answered taskList with no JSON-RPC response',
    });
  });

  it('throws an Error for a response without a result', () => {
    assert.throws(() => resultOf({ jsonrpc: '2.0', id: 1 }, 'taskList'), {
      name: 'Error',
      message: 'The server answered taskList with no result',
    });
  });
});
