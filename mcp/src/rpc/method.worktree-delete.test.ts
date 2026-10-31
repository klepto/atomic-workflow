import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, Task, TaskStatus, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import type { DeletedWorktrees, Worktrees } from '../worktree/worktrees.ts';
import type { MethodContext } from './method.ts';
import { worktreeDeleteMethod } from './method.worktree-delete.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Progress of a ticket that a test sets.
 */
type TicketSpec = Partial<TicketProgress>;

/**
 * Task of a test, with the fields that the test sets.
 */
interface TaskSpec {
  /**
   * Status of the task, `complete` by default.
   */
  readonly status?: TaskStatus;

  /**
   * Base branch of the task, `main` by default.
   */
  readonly baseBranch?: string | null;

  /**
   * Progress of the tickets of the task, one ticket in progress by default.
   */
  readonly tickets?: readonly TicketSpec[];
}

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Worktrees and branches that the fake worktrees of a test remove.
 */
const DELETED: DeletedWorktrees = {
  worktrees: ['/worktrees/1-cache-layer-redis/1-part-1-work'],
  branches: ['atomic/1-cache-layer-redis/1-part-1-work'],
  stoppedProcesses: [],
  warnings: [],
};

/**
 * Refusal of git that the fake worktrees of a test throw.
 */
const REFUSAL = new WorktreeError('not-allowed', 'The branch holds commits that have not landed');

/**
 * Progress of a ticket whose work has not started.
 */
const NOT_STARTED: TicketProgress = { status: 'not-started', stage: null, blockedReason: null };

/**
 * Returns the ticket to store as the ticket with the position `index` in its task.
 */
const newTicket = (index: number): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: `part-${index + 1}-work`,
  summary: 'Adds a part of the cache layer',
  description: 'Add a part of the cache layer.',
  dependsOn: [],
  fixes: null,
});

/**
 * Returns the task of `spec` after it is stored in the task store of `context`.
 */
const storedTask = async (context: MethodContext, spec: TaskSpec = {}): Promise<Task> => {
  const { status = 'complete', baseBranch = 'main', tickets = [{ status: 'in-progress', stage: 'prototype' }] } = spec;
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setDesign(id, 'Cache the answers in Redis.');
  await context.tasks.setTickets(
    id,
    tickets.map((_ticket, index) => newTicket(index)),
  );
  for (const [index, { status = 'not-started', stage = null, blockedReason = null }] of tickets.entries())
    await context.tasks.setTicketProgress(id, index + 1, { status, stage, blockedReason });
  await context.tasks.setStatus(id, status);
  await context.tasks.setBaseBranch(id, baseBranch);
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
 * Returns the progress of each stored ticket of the task `taskId` of the task store of `context`, in the order of
 * their ids.
 */
const progressOf = async (taskId: number, context: MethodContext): Promise<readonly TicketProgress[]> =>
  (await taskOf(taskId, context)).tickets.map(({ status, stage, blockedReason }) => ({ status, stage, blockedReason }));

/**
 * Returns fake worktrees that record each call of `deleteTicket`, `deleteTask` and `unlandedTickets` in `calls`, with
 * the ids of the task and the ticket, return `DELETED`, and give `unlanded` as the tickets whose commits the base
 * branch lacks.
 */
const deletingWorktrees = (calls: unknown[][], unlanded: readonly number[] = []): Worktrees => ({
  ...NO_WORKTREES,
  deleteTicket: async (task, ticket, force) => {
    calls.push(['deleteTicket', task.id, ticket.id, force]);
    return DELETED;
  },
  deleteTask: async (task, baseBranch, force) => {
    calls.push(['deleteTask', task.id, baseBranch, force]);
    return DELETED;
  },
  unlandedTickets: async (task, baseBranch) => {
    calls.push(['unlandedTickets', task.id, baseBranch]);
    return unlanded;
  },
});

/**
 * Returns fake worktrees whose `deleteTicket` and `deleteTask` reject with `REFUSAL`.
 */
const refusingWorktrees = (): Worktrees => ({
  ...NO_WORKTREES,
  deleteTicket: async () => {
    throw REFUSAL;
  },
  deleteTask: async () => {
    throw REFUSAL;
  },
  unlandedTickets: async () => [],
});

/**
 * Returns a validation of `assert.rejects` that accepts an `RpcError` of the code `code` whose message fits `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

/**
 * Validation of `assert.rejects` that accepts the invalid request that `REFUSAL` becomes.
 */
const isRefusal = (error: unknown): boolean => {
  assert.ok(error instanceof RpcError);
  assert.deepEqual(
    { code: error.code, message: error.message, data: error.data },
    { code: RPC_ERROR_CODES.INVALID_REQUEST, message: REFUSAL.message, data: { kind: 'not-allowed', files: [] } },
  );
  return true;
};

describe('worktreeDelete', () => {
  it('returns what the deletion of the ticket removed', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    assert.deepEqual(await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context), DELETED);
  });

  it('sets a ticket in progress or blocked not-started after the deletion of its worktree', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context, {
      tickets: [
        { status: 'in-progress', stage: 'tests' },
        { status: 'blocked', stage: 'refactor', blockedReason: 'Waits for a key' },
      ],
    });
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context);
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 2 }, context);
    assert.deepEqual(await progressOf(task.id, context), [NOT_STARTED, NOT_STARTED]);
  });

  it('keeps the status of a landed ticket after the deletion of its worktree', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context, { tickets: [{ status: 'needs-review' }, { status: 'done' }] });
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context);
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 2 }, context);
    assert.deepEqual(await progressOf(task.id, context), [
      { status: 'needs-review', stage: null, blockedReason: null },
      { status: 'done', stage: null, blockedReason: null },
    ]);
  });

  it('passes the task, the ticket and force to the deletion of the ticket', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context);
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context);
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1, force: true }, context);
    assert.deepEqual(calls, [
      ['deleteTicket', task.id, 1, false],
      ['deleteTicket', task.id, 1, true],
    ]);
  });

  it('releases the claim of the ticket after its deletion', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, caller);
    await testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  it('rejects a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, testConnection());
    await assert.rejects(
      testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a refusal of the deletion of the ticket with an invalid request and keeps its progress', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 1 }, context), isRefusal);
    assert.deepEqual(await progressOf(task.id, context), [
      { status: 'in-progress', stage: 'prototype', blockedReason: null },
    ]);
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeDeleteMethod, { taskId: task.id, ticketId: 2 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /has no ticket 2/),
    );
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeDeleteMethod, { taskId: 9 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('returns what the deletion of the task removed', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    assert.deepEqual(await testCall(worktreeDeleteMethod, { taskId: task.id }, context), DELETED);
  });

  it('only deletes the task without force, and keeps its tickets and its base branch', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls, [1]) });
    const task = await storedTask(context, {
      tickets: [{ status: 'done' }, { status: 'in-progress', stage: 'tests' }],
    });
    await testCall(worktreeDeleteMethod, { taskId: task.id }, context);
    assert.deepEqual(calls, [['deleteTask', task.id, 'main', false]]);
    const stored = await taskOf(task.id, context);
    assert.deepEqual(stored.tickets, task.tickets);
    assert.equal(stored.baseBranch, 'main');
  });

  it('reads the unlanded tickets before a forced deletion of the task, with its base branch', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'develop' });
    await testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context);
    assert.deepEqual(calls, [
      ['unlandedTickets', task.id, 'develop'],
      ['deleteTask', task.id, 'develop', true],
    ]);
  });

  it('sets not-started each ticket whose work a forced deletion of the task throws away', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([], [1, 2]) });
    const task = await storedTask(context, {
      tickets: [
        { status: 'done' },
        { status: 'needs-review' },
        { status: 'done' },
        { status: 'in-progress', stage: 'tests' },
        { status: 'blocked', stage: 'prototype', blockedReason: 'Waits for a key' },
        { status: 'not-started' },
      ],
    });
    await testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context);
    assert.deepEqual(await progressOf(task.id, context), [
      NOT_STARTED,
      NOT_STARTED,
      { status: 'done', stage: null, blockedReason: null },
      NOT_STARTED,
      NOT_STARTED,
      NOT_STARTED,
    ]);
  });

  it('keeps the base branch after a forced deletion while a ticket keeps its landed work', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([], [1]) });
    const task = await storedTask(context, { tickets: [{ status: 'done' }, { status: 'needs-review' }] });
    await testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context);
    assert.equal((await taskOf(task.id, context)).baseBranch, 'main');
  });

  it('forgets the base branch after a forced deletion once no ticket keeps its landed work', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([], [1]) });
    const task = await storedTask(context, {
      tickets: [{ status: 'done' }, { status: 'in-progress', stage: 'tests' }],
    });
    await testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context);
    assert.equal((await taskOf(task.id, context)).baseBranch, null);
  });

  it('rejects a forced deletion of a done task with an invalid request and removes nothing', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context, { status: 'done', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is done, so a forced deletion cannot reset its tickets/),
    );
    assert.deepEqual(calls, []);
  });

  it('deletes a done task without force', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context, { status: 'done', tickets: [{ status: 'done' }] });
    await testCall(worktreeDeleteMethod, { taskId: task.id }, context);
    assert.deepEqual(calls, [['deleteTask', task.id, 'main', false]]);
  });

  it('releases the claims of every ticket after the deletion of the task', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: deletingWorktrees([]) });
    const task = await storedTask(context, { tickets: [{ status: 'in-progress', stage: 'tests' }, {}] });
    context.ticketClaims.claim(task.id, 1, caller);
    await testCall(worktreeDeleteMethod, { taskId: task.id }, context);
    const other = testConnection();
    assert.deepEqual(
      [1, 2].map((ticketId) => context.ticketClaims.isHeldByOther(task.id, ticketId, other)),
      [false, false],
    );
  });

  it('rejects the deletion of a task with a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context, { tickets: [{}, { status: 'in-progress', stage: 'tests' }] });
    context.ticketClaims.claim(task.id, 2, testConnection());
    await assert.rejects(
      testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 2 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a refusal of the deletion of the task with an invalid request', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(testCall(worktreeDeleteMethod, { taskId: task.id }, context), isRefusal);
  });

  it('keeps every ticket and the base branch when a forced deletion of the task is refused', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context, { tickets: [{ status: 'in-progress', stage: 'tests' }] });
    await assert.rejects(testCall(worktreeDeleteMethod, { taskId: task.id, force: true }, context), isRefusal);
    assert.deepEqual(await taskOf(task.id, context), task);
  });
});
