import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { subagentEndMethod } from './method.subagent-end.ts';
import type { MethodContext } from './method.ts';

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Returns a context in which the orchestrator session `main` and its attached subagent `sub` have open inboxes.
 */
const endContext = (): MethodContext => {
  const context = testMethodContext();
  const connection = testConnection();
  context.sessionConnections.bind('main', connection);
  context.inboxes.open('main', NEVER_CLOSED);
  context.subagents.start('sub', 'main', connection);
  context.subagents.attach('sub');
  context.inboxes.open('sub', NEVER_CLOSED);
  return context;
};

describe('subagentEndMethod', () => {
  it('removes the subagent from the started subagents and closes its inbox', async () => {
    const context = endContext();
    await testCall(subagentEndMethod, { sessionId: 'sub' }, context);
    assert.deepEqual([context.subagents.list(), context.inboxes.find('sub')], [[], undefined]);
  });

  it('leaves a session that is no started subagent as it is', async () => {
    const context = endContext();
    await testCall(subagentEndMethod, { sessionId: 'main' }, context);
    assert.deepEqual([context.subagents.list().length, context.inboxes.find('main')], [1, 'main']);
  });

  it('leaves the inbox of a subagent that was stopped already open', async () => {
    const context = endContext();
    context.subagents.stop('sub');
    await testCall(subagentEndMethod, { sessionId: 'sub' }, context);
    assert.equal(context.inboxes.find('sub'), 'sub');
  });
});
