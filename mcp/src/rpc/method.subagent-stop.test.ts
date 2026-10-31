import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { subagentStopMethod } from './method.subagent-stop.ts';
import type { MethodContext } from './method.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Options of the context of a test of `subagentStop`.
 */
interface StopContextOptions {
  /**
   * Whether the subagent `sub` has attached.
   */
  readonly attached: boolean;

  /**
   * Whether the orchestrator session `main` has an open inbox.
   */
  readonly withInbox: boolean;
}

/**
 * Returns a context in which the orchestrator session `main` is bound to `connection`, and its subagent `sub` is
 * started with an open inbox, as `options` say.
 */
const stopContext = (
  connection: RpcConnection,
  { attached, withInbox }: StopContextOptions = { attached: true, withInbox: true },
): MethodContext => {
  const context = testMethodContext();
  context.sessionConnections.bind('main', connection);
  if (withInbox) context.inboxes.open('main', NEVER_CLOSED);
  context.subagents.start('sub', 'main', connection);
  if (attached) context.subagents.attach('sub');
  context.inboxes.open('sub', NEVER_CLOSED);
  return context;
};

/**
 * Returns a connection whose session server runs the subagent `sub` in the background task `task-7`.
 */
const taskConnection = (): TestConnection => {
  const connection = testConnection();
  connection.answer('subagentTaskId', { backgroundTaskId: 'task-7' });
  return connection;
};

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('subagentStopMethod', () => {
  it('removes the subagent from the started subagents and closes its inbox', async () => {
    const context = stopContext(taskConnection());
    await testCall(subagentStopMethod, { sessionId: 'sub' }, context);
    assert.deepEqual([context.subagents.list(), context.inboxes.find('sub')], [[], undefined]);
  });

  it('asks the orchestrator to stop the background task that runs the subagent', async () => {
    const connection = taskConnection();
    const context = stopContext(connection);
    await testCall(subagentStopMethod, { sessionId: 'sub' }, context);
    assert.deepEqual(connection.requests, [{ method: 'subagentTaskId', params: { sessionId: 'sub' } }]);
    const delivery = await context.inboxes.take('main', 0);
    const [message] = delivery.status === 'messages' ? delivery.messages : [];
    assert.match(message?.content ?? '', /Call the TaskStop tool with task_id "task-7"/);
  });

  it('sends the orchestrator no message while its session server knows no background task', async () => {
    const connection = testConnection();
    connection.answer('subagentTaskId', { backgroundTaskId: null });
    // Without an inbox of the orchestrator, a message to it would fail the call.
    const context = stopContext(connection, { attached: true, withInbox: false });
    await testCall(subagentStopMethod, { sessionId: 'sub' }, context);
    assert.deepEqual(context.subagents.list(), []);
  });

  it('stops a subagent that has not attached yet without a request to its orchestrator', async () => {
    const connection = taskConnection();
    const context = stopContext(connection, { attached: false, withInbox: true });
    await testCall(subagentStopMethod, { sessionId: 'sub' }, context);
    assert.deepEqual([connection.requests, context.inboxes.find('sub')], [[], undefined]);
  });

  it('rejects a session that is no started subagent with invalid parameters', async () => {
    const context = stopContext(taskConnection());
    await assert.rejects(testCall(subagentStopMethod, { sessionId: 'main' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No subagent main is started',
    });
  });

  it('rejects with invalid parameters and keeps the subagent started when the orchestrator has no inbox', async () => {
    const context = stopContext(taskConnection(), { attached: true, withInbox: false });
    await assert.rejects(testCall(subagentStopMethod, { sessionId: 'sub' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session main is attached',
    });
    assert.deepEqual(context.subagents.list(), [{ sessionId: 'sub', parentId: 'main' }]);
  });

  it('rejects as the request to the orchestrator does, and keeps the subagent started', async () => {
    const failing: RpcConnection = {
      ...testConnection(),
      request: async () => {
        throw new Error('The session server is gone');
      },
    };
    const context = stopContext(failing);
    await assert.rejects(testCall(subagentStopMethod, { sessionId: 'sub' }, context), {
      name: 'Error',
      message: 'The session server is gone',
    });
    assert.deepEqual(
      [context.subagents.list(), context.inboxes.find('sub')],
      [[{ sessionId: 'sub', parentId: 'main' }], 'sub'],
    );
  });
});
