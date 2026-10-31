import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, Task, TaskStatus, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import type { CreatedWorktrees, Worktrees } from '../worktree/worktrees.ts';
import type { MethodContext } from './method.ts';
import { worktreeCreateMethod } from './method.worktree-create.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Ticket of a test task: the fields of a stored ticket and of its progress that the test sets.
 */
type TicketSpec = Partial<NewTicket & TicketProgress>;

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Worktrees that the fake worktrees of a test make for a ticket.
 */
const CREATED: CreatedWorktrees = {
  task: { path: '/worktrees/1-cache-layer-redis', branch: 'atomic/1-cache-layer-redis' },
  ticket: {
    path: '/worktrees/1-cache-layer-redis/1-part-one-work',
    branch: 'atomic/1-cache-layer-redis/1-part-one-work',
  },
  baseBranch: 'main',
  taskBranchCreated: true,
  ticketBranchCreated: true,
  taskBranchSynced: false,
  uncommittedChanges: false,
  copyFailures: null,
  warnings: [],
};

/**
 * Refusal of git that the fake worktrees of a test throw.
 */
const CONFLICT = new WorktreeError('conflict', 'The sync of the task branch stopped on a conflict', ['src/cache.ts']);

/**
 * Returns the ticket of `spec` to store as the ticket with the position `index` in its task.
 */
const newTicket = (spec: TicketSpec, index: number): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: `part-${index + 1}-work`,
  summary: 'Adds a part of the cache layer',
  description: 'Add a part of the cache layer.',
  dependsOn: spec.dependsOn ?? [],
  fixes: null,
});

/**
 * Returns a task with the status `status`, `complete` by default, and the tickets of `tickets`, one not-started ticket
 * by default, after it is stored in the task store of `context`.
 */
const storedTask = async (
  context: MethodContext,
  tickets: readonly TicketSpec[] = [{}],
  status: TaskStatus = 'complete',
): Promise<Task> => {
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setDesign(id, 'Cache the answers in Redis.');
  await context.tasks.setTickets(id, tickets.map(newTicket));
  for (const [index, { status = 'not-started', stage = null, blockedReason = null }] of tickets.entries())
    await context.tasks.setTicketProgress(id, index + 1, { status, stage, blockedReason });
  await context.tasks.setStatus(id, status);
  return taskOf(id, context);
};

/**
 * Returns the stored task `taskId` of the task store of `context`, which must exist.
 */
const taskOf = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await context.tasks.get(taskId);
  assert.ok(task);
  return task;
};

/**
 * Returns the progress of the stored ticket `ticketId` of the task `taskId` of the task store of `context`.
 */
const progressOf = async (taskId: number, ticketId: number, context: MethodContext): Promise<TicketProgress> => {
  const ticket = (await taskOf(taskId, context)).tickets.find(({ id }) => id === ticketId);
  assert.ok(ticket);
  return { status: ticket.status, stage: ticket.stage, blockedReason: ticket.blockedReason };
};

/**
 * Returns fake worktrees whose `create` records the task id, the ticket id and the base branch of each call in
 * `calls`, and returns `created`.
 */
const creatingWorktrees = (calls: unknown[][], created: CreatedWorktrees = CREATED): Worktrees => ({
  ...NO_WORKTREES,
  create: async (task, ticket, baseBranch) => {
    calls.push([task.id, ticket.id, baseBranch]);
    return created;
  },
});

/**
 * Returns fake worktrees whose `create` rejects with `CONFLICT`.
 */
const refusingWorktrees = (): Worktrees => ({
  ...NO_WORKTREES,
  create: async () => {
    throw CONFLICT;
  },
});

/**
 * Returns a validation of `assert.rejects` that accepts an `RpcError` of the code `code` whose message fits `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

describe('worktreeCreate', () => {
  it('returns the worktrees and the ticket set in-progress', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context);
    const result = await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(result, {
      worktrees: CREATED,
      ticket: { ...task.tickets[0], status: 'in-progress', stage: null, blockedReason: null },
    });
  });

  it('stores the ticket in-progress', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'in-progress',
      stage: null,
      blockedReason: null,
    });
  });

  it('passes the task, the ticket and no base branch to the worktrees on the first start', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(calls, [[task.id, 1, null]]);
  });

  it('records the base branch of the worktrees on the first start of the task', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.equal((await taskOf(task.id, context)).baseBranch, 'main');
  });

  it('passes the recorded base branch to the worktrees and keeps it on a later start', async () => {
    const calls: unknown[][] = [];
    const created = { ...CREATED, baseBranch: 'other' };
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls, created) });
    const task = await storedTask(context, [{ status: 'needs-review' }, {}]);
    await context.tasks.setBaseBranch(task.id, 'develop');
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 2 }, context);
    assert.deepEqual(calls, [[task.id, 2, 'develop']]);
    assert.equal((await taskOf(task.id, context)).baseBranch, 'develop');
  });

  it('keeps the stage of a blocked ticket and clears its blocked reason', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context, [{ status: 'blocked', stage: 'tests', blockedReason: 'Waits for a key' }]);
    const result = await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    const progress = { status: 'in-progress', stage: 'tests', blockedReason: null };
    assert.deepEqual(
      { status: result.ticket.status, stage: result.ticket.stage, blockedReason: result.ticket.blockedReason },
      progress,
    );
    assert.deepEqual(await progressOf(task.id, 1, context), progress);
  });

  it('keeps the stage of a ticket in progress', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context, [{ status: 'in-progress', stage: 'refactor' }]);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'in-progress',
      stage: 'refactor',
      blockedReason: null,
    });
  });

  it('starts a ticket whose dependencies landed', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context, [{ status: 'done' }, { status: 'needs-review' }, { dependsOn: [1, 2] }]);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 3 }, context);
    assert.deepEqual(calls, [[task.id, 3, null]]);
  });

  it('leaves the claim of the ticket with the caller after the start', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: creatingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), true);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, caller), false);
  });

  it('resumes the work on a second call over the same connection', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context);
    await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    const result = await testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.equal(result.ticket.status, 'in-progress');
    assert.deepEqual(calls, [
      [task.id, 1, null],
      [task.id, 1, 'main'],
    ]);
  });

  it('rejects a ticket whose work landed with an invalid request', async () => {
    for (const status of ['needs-review', 'done'] as const) {
      const calls: unknown[][] = [];
      const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
      const task = await storedTask(context, [{ status }]);
      await assert.rejects(
        testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context),
        rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The work of ticket 1 landed already/),
      );
      assert.deepEqual(calls, []);
    }
  });

  it('rejects a ticket with a dependency whose work has not landed with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context, [{ status: 'done' }, { status: 'in-progress' }, { dependsOn: [1, 2] }]);
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 3 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 3 depends on tickets 2, whose work has not landed yet/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a caller without a connection with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Only a client that is connected/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees(calls) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, testConnection());
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context, [{}], 'plan-tickets');
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The plan of task \d+ is not complete/),
    );
  });

  it('rejects a task that is done with an invalid request', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context, [{}], 'done');
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is done/),
    );
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: 9, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: creatingWorktrees([]) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 2 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /has no ticket 2/),
    );
  });

  it('rejects a refusal of git with an invalid request that holds its kind and its files', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, message: error.message, data: error.data },
        {
          code: RPC_ERROR_CODES.INVALID_REQUEST,
          message: CONFLICT.message,
          data: { kind: 'conflict', files: ['src/cache.ts'] },
        },
      );
      return true;
    });
  });

  it('releases the claim of the ticket and keeps its progress when git refuses', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context), RpcError);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'not-started',
      stage: null,
      blockedReason: null,
    });
  });

  it('keeps the claim that the caller held before when git refuses', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: refusingWorktrees() });
    const task = await storedTask(context, [{ status: 'in-progress', stage: 'prototype' }]);
    context.ticketClaims.claim(task.id, 1, caller);
    await assert.rejects(testCall(worktreeCreateMethod, { taskId: task.id, ticketId: 1 }, context), RpcError);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), true);
  });
});
