import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionActivityReportMethod } from './method.session-activity-report.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

describe('sessionActivityReportMethod', () => {
  it('sets the status of the session from the time of the report on', async () => {
    const context = testMethodContext();
    await testCall(sessionActivityReportMethod, { sessionId: 'main', status: 'working', at: 5 }, context);
    assert.deepEqual(context.activity.get('main'), { status: 'working', turnStartedAt: 5, latestAction: null });
  });

  it('gives a report without a time the time of the call', async () => {
    const context = testMethodContext({ clock: testClock(70) });
    await testCall(sessionActivityReportMethod, { sessionId: 'main', status: 'waiting' }, context);
    assert.deepEqual(context.activity.get('main'), { status: 'waiting', turnStartedAt: 70, latestAction: null });
  });

  it('ignores a report older than the latest report of the session', async () => {
    const context = testMethodContext();
    await testCall(sessionActivityReportMethod, { sessionId: 'main', status: 'working', at: 10 }, context);
    await testCall(sessionActivityReportMethod, { sessionId: 'main', status: 'idle', at: 5 }, context);
    assert.equal(context.activity.get('main')?.status, 'working');
  });

  it('rejects a status that is not idle, working or waiting with invalid parameters', async () => {
    const params = { sessionId: 'main', status: 'sleeping', at: 5 };
    await assert.rejects(testCall(sessionActivityReportMethod, params, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
