import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionActionReportMethod } from './method.session-action-report.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Returns a context in which the session `main` works in a turn that started at 5.
 */
const workingContext = (): MethodContext => {
  const context = testMethodContext();
  context.activity.report('main', 'working', 5);
  return context;
};

describe('sessionActionReportMethod', () => {
  it('sets the newest action of the current turn of the session', async () => {
    const context = workingContext();
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: 'Bash: npm test', at: 6 }, context);
    assert.equal(context.activity.get('main')?.latestAction, 'Bash: npm test');
  });

  it('clears the newest action for null', async () => {
    const context = workingContext();
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: 'Bash: npm test', at: 6 }, context);
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: null, at: 7 }, context);
    assert.equal(context.activity.get('main')?.latestAction, null);
  });

  it('ignores an action older than the latest action of the session', async () => {
    const context = workingContext();
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: 'Read: a.ts', at: 8 }, context);
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: 'Read: b.ts', at: 7 }, context);
    assert.equal(context.activity.get('main')?.latestAction, 'Read: a.ts');
  });

  it('ignores an action older than the end of the latest turn of the session', async () => {
    const context = workingContext();
    context.activity.report('main', 'idle', 10);
    context.activity.report('main', 'working', 20);
    await testCall(sessionActionReportMethod, { sessionId: 'main', action: 'Read: a.ts', at: 9 }, context);
    assert.equal(context.activity.get('main')?.latestAction, null);
  });

  it('rejects an empty action with invalid parameters', async () => {
    await assert.rejects(
      testCall(sessionActionReportMethod, { sessionId: 'main', action: '', at: 6 }, workingContext()),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
      },
    );
  });
});
