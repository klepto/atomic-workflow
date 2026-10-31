import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testConnection } from './test-connection.ts';

describe('testConnection', () => {
  it('records each request with its method and its params in the order of sending', async () => {
    const connection = testConnection();
    await connection.request('first', { value: 1 });
    await connection.request('second');
    assert.deepEqual(connection.requests, [
      { method: 'first', params: { value: 1 } },
      { method: 'second', params: undefined },
    ]);
  });

  it('answers a request with the result that the test set for its method', async () => {
    const connection = testConnection();
    connection.answer('taskGet', { id: 3 });
    assert.deepEqual(await connection.request('taskGet', { task: 3 }), { id: 3 });
  });

  it('answers a request with null when the test set no result for its method', async () => {
    const connection = testConnection();
    connection.answer('taskGet', { id: 3 });
    assert.equal(await connection.request('taskList'), null);
  });

  it('answers with the latest result that the test set for a method', async () => {
    const connection = testConnection();
    connection.answer('echo', 'old');
    connection.answer('echo', 'new');
    assert.equal(await connection.request('echo'), 'new');
  });

  it('resolves closed once close is called', async () => {
    const connection = testConnection();
    connection.close();
    assert.equal(await connection.closed, undefined);
  });

  it('rejects a request after the close and does not record it', async () => {
    const connection = testConnection();
    connection.close();
    await assert.rejects(connection.request('echo'), Error);
    assert.deepEqual(connection.requests, []);
  });
});
