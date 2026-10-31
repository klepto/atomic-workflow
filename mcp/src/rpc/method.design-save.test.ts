import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { designSaveMethod } from './method.design-save.ts';
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

describe('designSave', () => {
  it('sets the design of a task and returns the task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(designSaveMethod, { taskId: task.id, design: '# Design\n\nA cache.' }, context);
    assert.deepEqual(result, { ...task, design: '# Design\n\nA cache.' });
  });

  it('replaces the stored design with the trimmed new one', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setDesign(task.id, '# Old design');
    const result = await testCall(designSaveMethod, { taskId: task.id, design: '  # New design\n' }, context);
    assert.equal(result.design, '# New design');
  });

  it('replaces the design of a complete task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'complete');
    const result = await testCall(designSaveMethod, { taskId: task.id, design: '# Amended design' }, context);
    assert.deepEqual([result.status, result.design], ['complete', '# Amended design']);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(designSaveMethod, { taskId: 5, design: '# Design' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 5 exists',
    });
  });

  it('rejects a done task with an invalid request and keeps its design', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setDesign(task.id, '# Design');
    await context.tasks.setStatus(task.id, 'done');
    await assert.rejects(testCall(designSaveMethod, { taskId: task.id, design: '# Other design' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 is done, so its plan cannot change',
    });
    assert.equal((await context.tasks.get(task.id))?.design, '# Design');
  });

  it('rejects a design of blanks only with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(testCall(designSaveMethod, { taskId: task.id, design: ' \n ' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
