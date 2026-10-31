import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRepositoryServerError } from '../attachment/attach.ts';
import { testAttachClient } from '../testing/test-attach-client.ts';
import { reportActivity } from './report-activity.ts';

describe('reportActivity', () => {
  it('reports the status of the session to the repository server', async () => {
    const client = testAttachClient();
    await reportActivity('session-1', 'waiting', '/repository', client.dependencies);
    assert.deepEqual(client.connection.requests, [
      { method: 'sessionActivityReport', params: { sessionId: 'session-1', status: 'waiting' } },
    ]);
  });

  it('closes the connection after the request', async () => {
    const client = testAttachClient();
    await reportActivity('session-1', 'idle', '/repository', client.dependencies);
    await client.connection.closed;
    await assert.rejects(client.connection.request('echo'), Error);
  });

  it('rejects when the request fails', async () => {
    const client = testAttachClient();
    client.connection.close();
    await assert.rejects(reportActivity('session-1', 'idle', '/repository', client.dependencies), Error);
    assert.deepEqual(client.connection.requests, []);
  });

  it('reports nothing outside of a repository', async () => {
    const client = testAttachClient({ addressError: new Error('The directory is in no repository') });
    await reportActivity('session-1', 'idle', '/tmp', client.dependencies);
    assert.deepEqual(client.attaches, []);
  });

  it('reports nothing when no repository server runs', async () => {
    const client = testAttachClient({ attachError: new NoRepositoryServerError('/repository/repository.sock') });
    await reportActivity('session-1', 'idle', '/repository', client.dependencies);
    assert.deepEqual(client.connection.requests, []);
  });
});
