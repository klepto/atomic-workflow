import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskRunEndMethod } from './method.task-run-end.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Creates a task with one goal in the task store of `context`, and returns it.
 */
const createTask = async (context: MethodContext): Promise<Task> =>
  context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });

describe('taskRunEnd', () => {
  it('ends the active run at the time of the clock and returns the task', async () => {
    const context = testMethodContext({ clock: testClock(3_000) });
    const task = await createTask(context);
    await context.tasks.startRun(task.id, 1_000);
    const result = await testCall(taskRunEndMethod, { taskId: task.id }, context);
    assert.deepEqual(result, { ...task, runStartedAt: 1_000, runEndedAt: 3_000 });
  });

  it('keeps a task that never ran as it is', async () => {
    const context = testMethodContext({ clock: testClock(3_000) });
    const task = await createTask(context);
    assert.deepEqual(await testCall(taskRunEndMethod, { taskId: task.id }, context), task);
  });

  it('keeps the end of a run that ended already', async () => {
    const context = testMethodContext({ clock: testClock(3_000) });
    const task = await createTask(context);
    await context.tasks.startRun(task.id, 1_000);
    await context.tasks.endRun(task.id, 2_000);
    const result = await testCall(taskRunEndMethod, { taskId: task.id }, context);
    assert.deepEqual([result.runStartedAt, result.runEndedAt], [1_000, 2_000]);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(taskRunEndMethod, { taskId: 2 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 2 exists',
    });
  });
});
