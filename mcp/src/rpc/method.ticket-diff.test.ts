import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewTicket, Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import type { TicketChanges, Worktrees } from '../worktree/worktrees.ts';
import { ticketDiffMethod } from './method.ticket-diff.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Changes that the fake worktrees of a test find for a ticket.
 */
const CHANGES: TicketChanges = {
  commit: 'abc1234',
  files: [
    {
      path: 'src/cache.ts',
      oldPath: null,
      status: 'added',
      additions: 1,
      deletions: 0,
      binary: false,
      generated: false,
      patch: 'diff --git a/src/cache.ts b/src/cache.ts\n',
    },
  ],
};

/**
 * Ticket of a test task, with the fields that no test reads.
 */
const NEW_TICKET: NewTicket = {
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: 'add-cache-layer',
  summary: 'Adds the cache layer',
  description: 'Add the cache layer.',
  dependsOn: [],
  fixes: null,
};

/**
 * Returns a task with one ticket and the base branch `baseBranch`, after it is stored in the task store of `context`.
 */
const storedTask = async (context: MethodContext, baseBranch: string | null = null): Promise<Task> => {
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setTickets(id, [NEW_TICKET]);
  await context.tasks.setStatus(id, 'complete');
  await context.tasks.setBaseBranch(id, baseBranch);
  const task = await context.tasks.get(id);
  assert.ok(task);
  return task;
};

/**
 * Returns a validation of `assert.rejects` that accepts an `RpcError` of the code `code` whose message fits `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

describe('ticketDiff', () => {
  it('returns the changes that the worktrees find for the ticket', async () => {
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges: async () => CHANGES } });
    const task = await storedTask(context);
    assert.deepEqual(await testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context), CHANGES);
  });

  it('returns null when no commit holds the work of the ticket', async () => {
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges: async () => undefined } });
    const task = await storedTask(context);
    assert.equal(await testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context), null);
  });

  it('passes the task, the ticket and the base branch of the task to the worktrees', async () => {
    const calls: unknown[][] = [];
    const ticketChanges: Worktrees['ticketChanges'] = async (task, ticket, baseBranch) => {
      calls.push([task.id, ticket.id, baseBranch]);
      return CHANGES;
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges } });
    const task = await storedTask(context, 'main');
    await testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(calls, [[task.id, 1, 'main']]);
  });

  it('passes no base branch for a task without one', async () => {
    const baseBranches: (string | null)[] = [];
    const ticketChanges: Worktrees['ticketChanges'] = async (_task, _ticket, baseBranch) => {
      baseBranches.push(baseBranch);
      return CHANGES;
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges } });
    const task = await storedTask(context);
    await testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context);
    assert.deepEqual(baseBranches, [null]);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext();
    await assert.rejects(
      testCall(ticketDiffMethod, { taskId: 9, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const context = testMethodContext();
    const task = await storedTask(context);
    await assert.rejects(
      testCall(ticketDiffMethod, { taskId: task.id, ticketId: 2 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /has no ticket 2/),
    );
  });

  it('rejects a refusal of the worktrees with an invalid request that holds its kind and its files', async () => {
    const ticketChanges = async (): Promise<never> => {
      throw new WorktreeError('not-allowed', 'The task branch is gone', ['src/cache.ts']);
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges } });
    const task = await storedTask(context);
    await assert.rejects(testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, message: error.message, data: error.data },
        {
          code: RPC_ERROR_CODES.INVALID_REQUEST,
          message: 'The task branch is gone',
          data: { kind: 'not-allowed', files: ['src/cache.ts'] },
        },
      );
      return true;
    });
  });

  it('rejects with any other failure of the worktrees as it is', async () => {
    const failure = new Error('The disk is full');
    const ticketChanges = async (): Promise<never> => {
      throw failure;
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, ticketChanges } });
    const task = await storedTask(context);
    await assert.rejects(testCall(ticketDiffMethod, { taskId: task.id, ticketId: 1 }, context), (error) => {
      assert.equal(error, failure);
      return true;
    });
  });
});
