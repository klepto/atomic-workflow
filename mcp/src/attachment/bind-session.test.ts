import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RPC_ERROR_CODES } from '../rpc/rpc-error.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { bindSessionMethod } from './bind-session.ts';

describe('bindSessionMethod', () => {
  it('binds the session to the connection of the session server', async () => {
    const context = testMethodContext();
    const connection = testConnection();
    await testCall(
      bindSessionMethod(() => connection),
      { sessionId: 'session-1' },
      context,
    );
    assert.equal(context.sessionConnections.get('session-1'), connection);
  });

  it('gives the session an inbox', async () => {
    const context = testMethodContext();
    await testCall(bindSessionMethod(testConnection), { sessionId: 'session-1' }, context);
    assert.equal(context.inboxes.find('session-1'), 'session-1');
  });

  it('closes the inbox of the session once the connection closes', async () => {
    const context = testMethodContext();
    const connection = testConnection();
    await testCall(
      bindSessionMethod(() => connection),
      { sessionId: 'session-1' },
      context,
    );
    connection.close();
    await connection.closed;
    assert.equal(context.inboxes.find('session-1'), undefined);
  });

  it('moves the inbox of the session that the connection served before to the new session', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const context = testMethodContext();
    const connection = testConnection();
    const method = bindSessionMethod(() => connection);
    await testCall(method, { sessionId: 'session-1' }, context);
    context.inboxes.deliver('session-1', 'hello');
    await testCall(method, { sessionId: 'session-2' }, context);
    assert.equal(context.inboxes.find('session-1'), undefined);
    assert.deepEqual(await context.inboxes.take('session-2', 0), {
      status: 'messages',
      sessionId: 'session-2',
      messages: [{ id: 1, content: 'hello' }],
    });
  });

  it('fails with INVALID_REQUEST before the client says hello as a session server', async () => {
    const context = testMethodContext();
    await assert.rejects(
      testCall(
        bindSessionMethod(() => undefined),
        { sessionId: 'session-1' },
        context,
      ),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_REQUEST },
    );
    assert.equal(context.inboxes.find('session-1'), undefined);
  });

  it('fails with INVALID_PARAMS for an empty session id', async () => {
    await assert.rejects(testCall(bindSessionMethod(testConnection), { sessionId: '' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
