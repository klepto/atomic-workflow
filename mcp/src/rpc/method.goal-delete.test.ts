import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { goalDeleteMethod } from './method.goal-delete.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Creates a task with the goals `First`, `Second` and `Third` in the task store of `context`, and returns it.
 */
const createTask = async (context: MethodContext): Promise<Task> => {
  const task = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'First', details: null, source: 'user' },
  });
  await context.tasks.addGoal(task.id, { summary: 'Second', details: 'More', source: 'agent' });
  await context.tasks.addGoal(task.id, { summary: 'Third', details: null, source: 'user' });
  return task;
};

describe('goalDelete', () => {
  it('deletes the goal, moves each later goal down by one and returns the task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(goalDeleteMethod, { taskId: task.id, goalId: 1 }, context);
    assert.deepEqual(result, {
      ...task,
      goals: [
        { id: 1, summary: 'Second', details: 'More', source: 'agent' },
        { id: 2, summary: 'Third', details: null, source: 'user' },
      ],
    });
  });

  it('deletes the last goal without a change of the others', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(goalDeleteMethod, { taskId: task.id, goalId: 3 }, context);
    assert.deepEqual(
      result.goals.map(({ id, summary }) => [id, summary]),
      [
        [1, 'First'],
        [2, 'Second'],
      ],
    );
  });

  it('rejects a goal that the task does not have with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await assert.rejects(testCall(goalDeleteMethod, { taskId: task.id, goalId: 4 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'Task 1 has no goal 4',
    });
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(goalDeleteMethod, { taskId: 2, goalId: 1 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 2 exists',
    });
  });

  it('rejects a complete task with an invalid request and keeps its goals', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'complete');
    await assert.rejects(testCall(goalDeleteMethod, { taskId: task.id, goalId: 1 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message:
        'The plan of task 1 is complete, so only its design and the tickets whose work has not started can change',
    });
    assert.equal((await context.tasks.get(task.id))?.goals.length, 3);
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    await context.tasks.setStatus(task.id, 'done');
    await assert.rejects(testCall(goalDeleteMethod, { taskId: task.id, goalId: 1 }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 is done, so its plan cannot change',
    });
  });
});
