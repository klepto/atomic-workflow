import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskSetStatusMethod } from './method.task-set-status.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Parts of the plan that `createTask` gives a task beside its first goal.
 */
interface PlanParts {
  /**
   * Whether the task keeps its first goal.
   */
  readonly goals?: boolean;

  /**
   * Whether the task has a design.
   */
  readonly design?: boolean;

  /**
   * Whether the task has a ticket.
   */
  readonly tickets?: boolean;
}

/**
 * Creates a task in the task store of `context` with each part of the plan that `parts` names, and returns it as
 * stored. The task keeps its first goal unless `parts.goals` is `false`.
 */
const createTask = async (context: MethodContext, parts: PlanParts = {}): Promise<Task> => {
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  if (parts.goals === false) await context.tasks.deleteGoal(id, 1);
  if (parts.design === true) await context.tasks.setDesign(id, '# Design');
  if (parts.tickets === true) {
    await context.tasks.setTickets(id, [
      {
        mode: 'unattended',
        type: 'code',
        complexity: 'simple',
        slug: 'add-cache-layer',
        summary: 'Adds the cache layer',
        description: 'Add the cache layer.',
        dependsOn: [],
        fixes: null,
      },
    ]);
  }
  const task = await context.tasks.get(id);
  assert.ok(task !== undefined);
  return task;
};

describe('taskSetStatus', () => {
  it('sets the status of a task and returns the task', async () => {
    const context = testMethodContext();
    const task = await createTask(context);
    const result = await testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-design' }, context);
    assert.deepEqual(result, { ...task, status: 'plan-design' });
  });

  it('sets a task complete once it has goals, a design and tickets', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true, tickets: true });
    const result = await testCall(taskSetStatusMethod, { taskId: task.id, status: 'complete' }, context);
    assert.equal(result.status, 'complete');
  });

  it('sets a task back to plan-goals from a later stage', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true });
    await context.tasks.setStatus(task.id, 'plan-tickets');
    const result = await testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-goals' }, context);
    assert.equal(result.status, 'plan-goals');
  });

  it('sets a task without goals to plan-goals', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { goals: false });
    const result = await testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-goals' }, context);
    assert.equal(result.status, 'plan-goals');
  });

  it('rejects plan-design for a task without goals with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { goals: false });
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-design' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 needs goals for the status plan-design',
    });
  });

  it('rejects plan-tickets for a task without a design with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { tickets: true });
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-tickets' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 needs a design for the status plan-tickets',
    });
  });

  it('rejects complete for a task without tickets with an invalid request and keeps its status', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true });
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'complete' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 needs tickets for the status complete',
    });
    assert.equal((await context.tasks.get(task.id))?.status, 'plan-goals');
  });

  it('names the first part of the plan that the task lacks', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { goals: false });
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'complete' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 needs goals for the status complete',
    });
  });

  it('rejects a complete task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true, tickets: true });
    await context.tasks.setStatus(task.id, 'complete');
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'plan-tickets' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message:
        'The plan of task 1 is complete, so only its design and the tickets whose work has not started can change',
    });
  });

  it('rejects a done task with an invalid request', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true, tickets: true });
    await context.tasks.setStatus(task.id, 'done');
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'complete' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'Task 1 is done, so its plan cannot change',
    });
  });

  it('rejects the status done with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await createTask(context, { design: true, tickets: true });
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: task.id, status: 'done' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
    assert.equal((await context.tasks.get(task.id))?.status, 'plan-goals');
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(testCall(taskSetStatusMethod, { taskId: 6, status: 'plan-goals' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No task 6 exists',
    });
  });
});
