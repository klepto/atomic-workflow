import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRepositoryServerError } from '../attachment/attach.ts';
import { testAttachClient } from '../testing/test-attach-client.ts';
import { resumeMessages } from './resume-messages.ts';

describe('resumeMessages', () => {
  it('asks the repository server for the wait command of the new session', async () => {
    const client = testAttachClient();
    client.connection.answer('inboxAwait', { commandLine: null });
    await resumeMessages('session-2', '/repository', client.dependencies);
    assert.deepEqual(client.connection.requests, [{ method: 'inboxAwait', params: { sessionId: 'session-2' } }]);
  });

  it('tells the agent to run the wait command in the background when the session has an inbox', async () => {
    const client = testAttachClient();
    client.connection.answer('inboxAwait', { commandLine: 'node await-command.mjs session-2' });
    const output = await resumeMessages('session-2', '/repository', client.dependencies);
    assert.equal(output?.hookSpecificOutput.hookEventName, 'SessionStart');
    const lines = output?.hookSpecificOutput.additionalContext.split('\n') ?? [];
    assert.equal(
      lines[1],
      'Run this command now with the Bash tool, with run_in_background set to true: node await-command.mjs session-2',
    );
  });

  it('returns undefined when the session has no inbox', async () => {
    const client = testAttachClient();
    client.connection.answer('inboxAwait', { commandLine: null });
    assert.equal(await resumeMessages('session-2', '/repository', client.dependencies), undefined);
  });

  it('closes the connection after the request', async () => {
    const client = testAttachClient();
    client.connection.answer('inboxAwait', { commandLine: null });
    await resumeMessages('session-2', '/repository', client.dependencies);
    await client.connection.closed;
    await assert.rejects(client.connection.request('echo'), Error);
  });

  it('rejects when the request fails', async () => {
    const client = testAttachClient();
    client.connection.close();
    await assert.rejects(resumeMessages('session-2', '/repository', client.dependencies), Error);
  });

  it('returns undefined outside of a repository', async () => {
    const client = testAttachClient({ addressError: new Error('The directory is in no repository') });
    assert.equal(await resumeMessages('session-2', '/tmp', client.dependencies), undefined);
  });

  it('returns undefined when no repository server runs', async () => {
    const client = testAttachClient({ attachError: new NoRepositoryServerError('/repository/repository.sock') });
    assert.equal(await resumeMessages('session-2', '/repository', client.dependencies), undefined);
  });

  it('rejects when the attach fails', async () => {
    const client = testAttachClient({ attachError: new Error('The repository server did not answer hello') });
    await assert.rejects(resumeMessages('session-2', '/repository', client.dependencies), {
      message: 'The repository server did not answer hello',
    });
  });
});
