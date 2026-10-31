import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { inboxAwaitMethod } from './method.inbox-await.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

// The wait for an inbox to open ends with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('inboxAwaitMethod', () => {
  it('returns the command line that waits for the messages of a session with an open inbox at once', async () => {
    const context = testMethodContext();
    context.inboxes.open('main', NEVER_CLOSED);
    assert.deepEqual(await testCall(inboxAwaitMethod, { sessionId: 'main' }, context), { commandLine: 'await main' });
  });

  it('returns the command line once the inbox of the session opens after the call starts', async () => {
    const context = testMethodContext();
    const result = testCall(inboxAwaitMethod, { sessionId: 'main' }, context);
    context.inboxes.open('main', NEVER_CLOSED);
    assert.deepEqual(await result, { commandLine: 'await main' });
  });

  it('counts an inbox that moves to the session as opened', async () => {
    const context = testMethodContext();
    context.inboxes.open('old', NEVER_CLOSED);
    const result = testCall(inboxAwaitMethod, { sessionId: 'new' }, context);
    context.inboxes.move('old', 'new');
    assert.deepEqual(await result, { commandLine: 'await new' });
  });

  it('rejects an empty session id with invalid parameters', async () => {
    await assert.rejects(testCall(inboxAwaitMethod, { sessionId: '' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
