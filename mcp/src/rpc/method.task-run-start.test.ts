import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskRunStartMethod } from './method.task-run-start.ts';
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

/**
 * Closes `connection`, and resolves once each callback that waits for its close ran.
 */
const close = async (connection: TestConnection): Promise<void> => {
  connection.close();
  await connection.closed;
  await new Promise(setImmediate);
};

/**
 * Returns the start and the end of the latest run of the task `taskId` of the task store of `context`.
 */
const runOf = async (context: MethodContext, taskId: number): Promise<readonly (number | null | undefined)[]> => {
  const task = await context.tasks.get(taskId);
  return [task?.runStartedAt, task?.runEndedAt];
};

describe('taskRunStart', () => {
  it('starts the run at the time of the clock and returns the task', async () => {
    const context = testMethodContext({ clock: testClock(1_000) });
    const task = await createTask(context);
    const result = await testCall(taskRunStartMethod, { taskId: task.id }, context);
    assert.deepEqual(result, { ...task, runStartedAt: 1_000, runEndedAt: null });
  });

  it('restarts an active run from now', async () => {
    const clock = testClock(1_000);
    const context = testMethodContext({ clock });
    const task = await createTask(context);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    clock.set(3_000);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    assert.deepEqual(await runOf(context, task.id), [3_000, null]);
  });

  it('starts a new run after a run that ended', async () => {
    const clock = testClock(1_000);
    const context = testMethodContext({ clock });
    const task = await createTask(context);
    await context.tasks.startRun(task.id, 500);
    await context.tasks.endRun(task.id, 800);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    assert.deepEqual(await runOf(context, task.id), [1_000, null]);
  });

  it('ends the run at the time of the clock once the connection of the caller closes', async () => {
    const clock = testClock(1_000);
    const caller = testConnection();
    const context = testMethodContext({ clock, caller });
    const task = await createTask(context);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    clock.set(4_000);
    await close(caller);
    assert.deepEqual(await runOf(context, task.id), [1_000, 4_000]);
  });

  it('keeps the run that started later when the connection of an earlier caller closes', async () => {
    const clock = testClock(1_000);
    const earlier = testConnection();
    const context = testMethodContext({ clock, caller: earlier });
    const task = await createTask(context);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    clock.set(2_000);
    await testCall(taskRunStartMethod, { taskId: task.id }, { ...context, caller: testConnection() });
    clock.set(3_000);
    await close(earlier);
    assert.deepEqual(await runOf(context, task.id), [2_000, null]);
  });

  it('keeps the end of a run that ended before the connection of its caller closes', async () => {
    const clock = testClock(1_000);
    const caller = testConnection();
    const context = testMethodContext({ clock, caller });
    const task = await createTask(context);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    await context.tasks.endRun(task.id, 2_000);
    clock.set(3_000);
    await close(caller);
    assert.deepEqual(await runOf(context, task.id), [1_000, 2_000]);
  });

  it('keeps the run active without a caller', async () => {
    const context = testMethodContext({ clock: testClock(1_000) });
    const task = await createTask(context);
    await testCall(taskRunStartMethod, { taskId: task.id }, context);
    await new Promise(setImmediate);
    assert.deepEqual(await runOf(context, task.id), [1_000, null]);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(taskRunStartMethod, { taskId: 2 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 2 exists',
    });
  });
});
