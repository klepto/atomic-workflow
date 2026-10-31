import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TEST_ATTACH_URL, testAttachClient } from './test-attach-client.ts';

describe('testAttachClient', () => {
  it('returns the address of the repository server in the directory', async () => {
    const client = testAttachClient();
    assert.equal(await client.dependencies.repositoryAddress('/repository'), '/repository/repository.sock');
  });

  it('attaches with its connection, and records each attach', async () => {
    const client = testAttachClient();
    const handle = async (): Promise<undefined> => undefined;
    const dependencies = { openConnection: client.dependencies.openConnection, handle };
    const attachment = await client.dependencies.attach('/repository/repository.sock', 'client', dependencies);
    assert.deepEqual(attachment, { launched: false, url: TEST_ATTACH_URL, connection: client.connection });
    assert.deepEqual(client.attaches, [{ address: '/repository/repository.sock', role: 'client', dependencies }]);
  });

  it('rejects with the errors of its options', async () => {
    const client = testAttachClient({ addressError: new Error('No repository'), attachError: new Error('No server') });
    await assert.rejects(client.dependencies.repositoryAddress('/tmp'), { message: 'No repository' });
    const dependencies = { openConnection: client.dependencies.openConnection, handle: async () => undefined };
    await assert.rejects(client.dependencies.attach('/tmp/repository.sock', 'client', dependencies), {
      message: 'No server',
    });
  });

  it('records each dispatched message and answers it with undefined', async () => {
    const client = testAttachClient();
    assert.equal(await client.dependencies.dispatch([], undefined, { id: 1 }), undefined);
    assert.deepEqual(client.dispatched, [{ id: 1 }]);
  });
});
