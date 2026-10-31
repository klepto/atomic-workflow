import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, Task, TaskStatus, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import type { MergedTask, MergedTicket, Worktrees } from '../worktree/worktrees.ts';
import type { MethodContext } from './method.ts';
import { worktreeMergeMethod } from './method.worktree-merge.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Ticket of a test task: the fields of a stored ticket and of its progress that the test sets.
 */
type TicketSpec = Partial<NewTicket & TicketProgress>;

/**
 * Task of a test, with the fields that the test sets.
 */
interface TaskSpec {
  /**
   * Status of the task, `complete` by default.
   */
  readonly status?: TaskStatus;

  /**
   * Base branch of the task, `null` by default.
   */
  readonly baseBranch?: string | null;

  /**
   * Tickets of the task, one ticket in progress by default.
   */
  readonly tickets?: readonly TicketSpec[];
}

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Work of a ticket that the fake worktrees of a test land.
 */
const MERGED_TICKET: MergedTicket = { taskBranch: 'atomic/1-cache-layer-redis', commit: 'abc1234' };

/**
 * Work of a task that the fake worktrees of a test land.
 */
const MERGED_TASK: MergedTask = {
  baseBranch: 'main',
  commit: 'def5678',
  deleted: {
    worktrees: ['/worktrees/1-cache-layer-redis'],
    branches: ['atomic/1-cache-layer-redis'],
    stoppedProcesses: [],
    warnings: [],
  },
};

/**
 * Refusal of git that the fake worktrees of a test throw.
 */
const CONFLICT = new WorktreeError('conflict', 'The rebase of the ticket stopped on a conflict', ['src/cache.ts']);

/**
 * Message of the commit of a ticket in the tests.
 */
const MESSAGE = 'feat: add the cache layer';

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
  const { status = 'complete', baseBranch = null, tickets = [{ status: 'in-progress', stage: 'prototype' }] } = spec;
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
 * Returns the progress of the stored ticket `ticketId` of the task `taskId` of the task store of `context`.
 */
const progressOf = async (taskId: number, ticketId: number, context: MethodContext): Promise<TicketProgress> => {
  const ticket = (await taskOf(taskId, context)).tickets.find(({ id }) => id === ticketId);
  assert.ok(ticket);
  return { status: ticket.status, stage: ticket.stage, blockedReason: ticket.blockedReason };
};

/**
 * Returns fake worktrees whose `merge` and `mergeTask` record the arguments of each call in `calls`, with the ids of
 * the task and the ticket, and return `MERGED_TICKET` and `MERGED_TASK`.
 */
const mergingWorktrees = (calls: unknown[][]): Worktrees => ({
  ...NO_WORKTREES,
  merge: async (task, ticket, message) => {
    calls.push(['merge', task.id, ticket.id, message]);
    return MERGED_TICKET;
  },
  mergeTask: async (task, baseBranch) => {
    calls.push(['mergeTask', task.id, baseBranch]);
    return MERGED_TASK;
  },
});

/**
 * Returns fake worktrees whose `merge` and `mergeTask` reject with `CONFLICT`.
 */
const refusingWorktrees = (): Worktrees => ({
  ...NO_WORKTREES,
  merge: async () => {
    throw CONFLICT;
  },
  mergeTask: async () => {
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

describe('worktreeMerge', () => {
  it('returns the task branch, the commit and the ticket set needs-review', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    const result = await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(result, {
      ...MERGED_TICKET,
      ticket: { ...task.tickets[0], status: 'needs-review', stage: null, blockedReason: null },
    });
  });

  it('stores the ticket needs-review', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'needs-review',
      stage: null,
      blockedReason: null,
    });
  });

  it('passes the task, the ticket and the trimmed message to the worktrees', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    const message = `  ${MESSAGE}\n\nAdd a cache in front of the answers.\n`;
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message }, context);
    assert.deepEqual(calls, [['merge', task.id, 1, `${MESSAGE}\n\nAdd a cache in front of the answers.`]]);
  });

  it('merges a blocked ticket', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, {
      tickets: [{ status: 'blocked', stage: 'tests', blockedReason: 'Waits' }],
    });
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'needs-review',
      stage: null,
      blockedReason: null,
    });
  });

  it('releases the claim of the caller after the merge of the ticket', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, caller);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  it('rejects a ticket without a message with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /The merge of a ticket needs a message/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a message that does not start with a summary line with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    for (const message of ['Add the cache layer', 'feature: add the cache layer', 'feat:add the cache layer']) {
      await assert.rejects(
        testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message }, context),
        rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Must start with a summary line/),
      );
    }
    assert.deepEqual(calls, []);
  });

  it('accepts a summary line with a scope and a breaking change mark', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: 'fix(cache)!: drop it' }, context);
    assert.deepEqual(calls, [['merge', task.id, 1, 'fix(cache)!: drop it']]);
  });

  it('rejects a ticket that is not in progress or blocked with an invalid request', async () => {
    for (const status of ['not-started', 'needs-review', 'done'] as const) {
      const calls: unknown[][] = [];
      const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
      const task = await storedTask(context, { tickets: [{ status }] });
      await assert.rejects(
        testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
        rpcError(
          RPC_ERROR_CODES.INVALID_REQUEST,
          new RegExp(`Ticket 1 is ${status}, and only a ticket in progress or blocked can merge`),
        ),
      );
      assert.deepEqual(calls, []);
    }
  });

  it('rejects a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, testConnection());
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a ticket of a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { status: 'plan-tickets' });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The plan of task \d+ is not complete/),
    );
  });

  it('rejects the merge of a ticket of a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: 9, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 2, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /has no ticket 2/),
    );
  });

  it('rejects a refusal of git with an invalid request that holds its kind and its files', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      (error) => {
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
      },
    );
  });

  it('keeps the claim and the progress of the ticket for a connected caller when the merge fails', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      RpcError,
    );
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), true);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'in-progress',
      stage: 'prototype',
      blockedReason: null,
    });
  });

  it('releases the claim of the ticket for a caller without a connection when the merge fails', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      RpcError,
    );
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  it('returns the merged task with the task set done without a ticket', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    const result = await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(result, { ...MERGED_TASK, task: { ...task, status: 'done' } });
  });

  it('stores the task done after the merge of the task', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.equal((await taskOf(task.id, context)).status, 'done');
  });

  it('passes the task and its base branch to the worktrees without a ticket', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'develop', tickets: [{ status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(calls, [['mergeTask', task.id, 'develop']]);
  });

  it('releases the claims of every ticket after the merge of the task', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    const other = testConnection();
    assert.deepEqual(
      [1, 2].map((ticketId) => context.ticketClaims.isHeldByOther(task.id, ticketId, other)),
      [false, false],
    );
  });

  it('rejects a message without a ticket with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Only the merge of a ticket takes a message/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task with a ticket that is not done with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, {
      baseBranch: 'main',
      tickets: [{ status: 'done' }, { status: 'needs-review' }, { status: 'not-started' }],
    });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Tickets 2, 3 of task \d+ are not done/),
    );
    assert.deepEqual(calls, []);
    assert.equal((await taskOf(task.id, context)).status, 'complete');
  });

  it('rejects the merge of a task without a base branch with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /has no base branch/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task whose plan is not complete with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { status: 'plan-tickets', baseBranch: 'main', tickets: [{}] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The plan of task \d+ is not complete/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task that is done with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { status: 'done', baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /is done, and its branch landed already/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task with a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    context.ticketClaims.claim(task.id, 2, testConnection());
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 2 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: 9 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a refusal of git for the task with an invalid request and keeps the task complete', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(testCall(worktreeMergeMethod, { taskId: task.id }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, data: error.data },
        { code: RPC_ERROR_CODES.INVALID_REQUEST, data: { kind: 'conflict', files: ['src/cache.ts'] } },
      );
      return true;
    });
    assert.equal((await taskOf(task.id, context)).status, 'complete');
  });
});
