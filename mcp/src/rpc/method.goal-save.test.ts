import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { goalSaveMethod } from './method.goal-save.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Creates a task whose first goal came from the agent in the task store of `context`, and returns it.
 */
const createTask = async (context: MethodContext): Promise<Task> =>
  context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: 'For an hour', source: 'agent' },
  });

describe('goalSave', () => {
  it('adds a new goal at the end of the goals and returns the task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(
      goalSaveMethod,
      { taskId: task.id, summary: 'Expire the answers', details: 'After an hour', source: 'user' },
      context,
    );
    assert.deepEqual(result, {
      ...task,
      goals: [...task.goals, { id: 2, summary: 'Expire the answers', details: 'After an hour', source: 'user' }],
    });
  });

  it('gives a new goal no details when the details are left out', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(
      goalSaveMethod,
      { taskId: task.id, summary: 'Expire the answers', source: 'user' },
      context,
    );
    assert.deepEqual(result.goals[1], { id: 2, summary: 'Expire the answers', details: null, source: 'user' });
  });

  it('replaces the text of a goal and keeps its source', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(
      goalSaveMethod,
      { taskId: task.id, goalId: 1, summary: 'Cache the answers in Redis', source: 'user' },
      context,
    );
    assert.deepEqual(result.goals, [{ id: 1, summary: 'Cache the answers in Redis', details: null, source: 'agent' }]);
  });

  it('rejects a new goal without a source with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(testCall(goalSaveMethod, { taskId: task.id, summary: 'Expire the answers' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'A new goal needs a source',
    });
    assert.equal((await context.tasks.get(task.id))?.goals.length, 1);
  });

  it('rejects a goal that the task does not have with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(testCall(goalSaveMethod, { taskId: task.id, goalId: 2, summary: 'Expire' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'Task 1 has no goal 2',
    });
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(
      testCall(goalSaveMethod, { taskId: 3, summary: 'Expire the answers', source: 'user' }, testMethodContext()),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: 'No task 3 exists' },
    );
  });

  it('rejects a complete task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'complete');
    await assert.rejects(
      testCall(goalSaveMethod, { taskId: task.id, summary: 'Expire the answers', source: 'user' }, context),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message:
          'The plan of task 1 is complete, so only its design and the tickets whose work has not started can change',
      },
    );
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'done');
    await assert.rejects(testCall(goalSaveMethod, { taskId: task.id, goalId: 1, summary: 'Expire' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 is done, so its plan cannot change',
    });
  });

  it('rejects a summary on several lines with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(
      testCall(goalSaveMethod, { taskId: task.id, summary: 'Expire\nthe answers', source: 'user' }, context),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: /Must be one line/ },
    );
  });
});
