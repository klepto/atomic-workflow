import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Creates a task with the slug `slug` and one goal in the task store of `context`, and returns it.
 */
const createTask = async (context: MethodContext, slug: string): Promise<Task> =>
  context.tasks.create({ slug, createdAt: 0, goal: { summary: 'Cache the answers', details: null, source: 'user' } });

describe('taskGet', () => {
  it('returns the task with its plan by its id', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    const task = await createTask(context, 'login-page-form');
    await context.tasks.setDesign(task.id, '# Design');
    const result = await testCall(taskGetMethod, { task: 2 }, context);
    assert.deepEqual(result, { ...task, design: '# Design' });
  });

  it('returns the task by its id written as a word of digits', async () => {
    const context = testMethodContext();
    const task = await createTask(context, 'cache-layer-redis');
    assert.deepEqual(await testCall(taskGetMethod, { task: '1' }, context), task);
  });

  it('returns the task by its slug', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    const task = await createTask(context, 'login-page-form');
    assert.deepEqual(await testCall(taskGetMethod, { task: 'login-page-form' }, context), task);
  });

  it('returns the task by its id and its slug as <id>-<slug>', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    const task = await createTask(context, 'login-page-form');
    assert.deepEqual(await testCall(taskGetMethod, { task: '2-login-page-form' }, context), task);
  });

  it('returns the task whose slug starts with digits by its slug', async () => {
    const context = testMethodContext();
    const task = await createTask(context, '2-factor-login');
    assert.deepEqual(await testCall(taskGetMethod, { task: '2-factor-login' }, context), task);
  });

  it('returns one of several tasks with one slug by its <id>-<slug>', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    const task = await createTask(context, 'cache-layer-redis');
    assert.deepEqual(await testCall(taskGetMethod, { task: '2-cache-layer-redis' }, context), task);
  });

  it('rejects an id that no task has with invalid parameters', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    await assert.rejects(testCall(taskGetMethod, { task: 7 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 7 exists',
    });
  });

  it('rejects a slug that no task has with invalid parameters', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    await assert.rejects(testCall(taskGetMethod, { task: 'login-page-form' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task has the slug login-page-form',
    });
  });

  it('rejects an <id>-<slug> whose task has another slug with invalid parameters', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    await assert.rejects(testCall(taskGetMethod, { task: '1-login-page-form' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 1-login-page-form exists: task 1 is 1-cache-layer-redis',
    });
  });

  it('rejects an <id>-<slug> whose id no task has with invalid parameters', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    await assert.rejects(testCall(taskGetMethod, { task: '4-cache-layer-redis' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 4 exists',
    });
  });

  it('rejects a slug that several tasks have with invalid parameters that list each as <id>-<slug>', async () => {
    const context = testMethodContext();
    await createTask(context, 'cache-layer-redis');
    await createTask(context, 'login-page-form');
    await createTask(context, 'cache-layer-redis');
    await assert.rejects(testCall(taskGetMethod, { task: 'cache-layer-redis' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message:
        'Several tasks have the slug cache-layer-redis: 1-cache-layer-redis, 3-cache-layer-redis. Name one by its id',
    });
  });

  it('rejects an id that is not positive with invalid parameters', async () => {
    await assert.rejects(testCall(taskGetMethod, { task: 0 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
