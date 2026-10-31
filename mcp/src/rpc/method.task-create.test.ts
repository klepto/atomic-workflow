import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskCreateMethod } from './method.task-create.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Parameters of a valid call of `taskCreate`.
 */
const PARAMS = { slug: 'cache-layer-redis', summary: 'Cache the answers in Redis', source: 'user' };

describe('taskCreate', () => {
  it('returns a new task with the status plan-goals, its first goal and the time of the clock', async () => {
    const context = testMethodContext({ clock: testClock(5_000) });
    const task = await testCall(taskCreateMethod, { ...PARAMS, details: 'Keep each answer for an hour' }, context);
    assert.deepEqual(task, {
      id: 1,
      slug: 'cache-layer-redis',
      status: 'plan-goals',
      createdAt: 5_000,
      goals: [
        { id: 1, summary: 'Cache the answers in Redis', details: 'Keep each answer for an hour', source: 'user' },
      ],
      design: null,
      baseBranch: null,
      runStartedAt: null,
      runEndedAt: null,
      tickets: [],
    });
  });

  it('stores the task that it returns', async () => {
    const context = testMethodContext();
    const task = await testCall(taskCreateMethod, PARAMS, context);
    assert.deepEqual(await context.tasks.get(task.id), task);
  });

  it('gives the first goal no details when the details are left out', async () => {
    const task = await testCall(taskCreateMethod, { ...PARAMS, source: 'agent' }, testMethodContext());
    assert.deepEqual(task.goals, [{ id: 1, summary: 'Cache the answers in Redis', details: null, source: 'agent' }]);
  });

  it('rejects a slug that is not three lowercase words with invalid parameters', async () => {
    await assert.rejects(testCall(taskCreateMethod, { ...PARAMS, slug: 'Cache-layer' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });

  it('rejects a summary on several lines with invalid parameters', async () => {
    await assert.rejects(
      testCall(taskCreateMethod, { ...PARAMS, summary: 'Cache the answers\nin Redis' }, testMethodContext()),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: /Must be one line/ },
    );
  });

  it('rejects a call without a source with invalid parameters', async () => {
    await assert.rejects(
      testCall(taskCreateMethod, { slug: PARAMS.slug, summary: PARAMS.summary }, testMethodContext()),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: /source/ },
    );
  });

  it('creates no task for parameters that do not fit the schema', async () => {
    const context = testMethodContext();
    await assert.rejects(testCall(taskCreateMethod, { ...PARAMS, slug: 'cache' }, context));
    assert.deepEqual(await context.tasks.list(), []);
  });
});
