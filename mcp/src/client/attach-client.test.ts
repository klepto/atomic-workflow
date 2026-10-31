import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRepositoryServerError } from '../attachment/attach.ts';
import { TEST_ATTACH_URL, testAttachClient } from '../testing/test-attach-client.ts';
import { attachClient, attachRunningClient } from './attach-client.ts';

describe('attachClient', () => {
  it('attaches as a client to the repository server of the directory', async () => {
    const client = testAttachClient();
    const attachment = await attachClient('/repository', client.dependencies);
    assert.deepEqual(attachment, { launched: false, url: TEST_ATTACH_URL, connection: client.connection });
    assert.deepEqual(
      client.attaches.map(({ address, role }) => ({ address, role })),
      [{ address: '/repository/repository.sock', role: 'client' }],
    );
  });

  it('attaches with no launch and the function that opens the connection', async () => {
    const client = testAttachClient();
    await attachClient('/repository', client.dependencies);
    const [attach] = client.attaches;
    assert.equal(attach?.dependencies.launch, undefined);
    assert.equal(attach?.dependencies.openConnection, client.dependencies.openConnection);
  });

  it('answers each request of the repository server with no method', async () => {
    const client = testAttachClient();
    await attachClient('/repository', client.dependencies);
    const message = { jsonrpc: '2.0', id: 1, method: 'echo' };
    assert.equal(await client.attaches[0]?.dependencies.handle(message), undefined);
    assert.deepEqual(client.dispatched, [message]);
  });

  it('rejects for a directory outside of a repository', async () => {
    const client = testAttachClient({ addressError: new Error('The directory is in no repository') });
    await assert.rejects(attachClient('/tmp', client.dependencies), { message: 'The directory is in no repository' });
  });

  it('rejects with a NoRepositoryServerError when no repository server runs', async () => {
    const client = testAttachClient({ attachError: new NoRepositoryServerError('/repository/repository.sock') });
    await assert.rejects(attachClient('/repository', client.dependencies), NoRepositoryServerError);
  });
});

describe('attachRunningClient', () => {
  it('returns the attachment of a client', async () => {
    const client = testAttachClient();
    const attachment = await attachRunningClient('/repository', client.dependencies);
    assert.equal(attachment?.connection, client.connection);
    assert.equal(client.attaches[0]?.role, 'client');
  });

  it('returns undefined for a directory outside of a repository', async () => {
    const client = testAttachClient({ addressError: new Error('The directory is in no repository') });
    assert.equal(await attachRunningClient('/tmp', client.dependencies), undefined);
    assert.deepEqual(client.attaches, []);
  });

  it('returns undefined when no repository server runs', async () => {
    const client = testAttachClient({ attachError: new NoRepositoryServerError('/repository/repository.sock') });
    assert.equal(await attachRunningClient('/repository', client.dependencies), undefined);
  });

  it('rejects when the attach fails for another cause', async () => {
    const client = testAttachClient({ attachError: new Error('The repository server did not answer hello') });
    await assert.rejects(attachRunningClient('/repository', client.dependencies), {
      message: 'The repository server did not answer hello',
    });
  });
});
