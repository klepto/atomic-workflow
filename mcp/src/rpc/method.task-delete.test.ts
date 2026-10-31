import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { NewTicket, Task } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { WorktreeError } from '../worktree/worktree-error.ts';
import type { DeletedWorktrees, Worktrees } from '../worktree/worktrees.ts';
import { taskDeleteMethod } from './method.task-delete.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Worktrees and branches that the fake worktrees of a test remove.
 */
const DELETED: DeletedWorktrees = {
  worktrees: ['/worktrees/1-cache-layer-redis'],
  branches: ['atomic/1-cache-layer-redis'],
  stoppedProcesses: [],
  warnings: [],
};

/**
 * Refusal of git that the fake worktrees of a test throw.
 */
const REFUSAL = new WorktreeError('not-allowed', 'The task branch holds commits that have not landed');

/**
 * Slug of each task of the tests.
 */
const SLUG = 'cache-layer-redis';

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
 * Returns a complete task of the slug `SLUG` with two tickets and the base branch `baseBranch`, after it is stored in
 * the task store of `context`.
 */
const storedTask = async (context: MethodContext, baseBranch: string | null = 'main'): Promise<Task> => {
  const { id } = await context.tasks.create({
    slug: SLUG,
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setDesign(id, 'Cache the answers in Redis.');
  await context.tasks.setTickets(id, [NEW_TICKET, { ...NEW_TICKET, slug: 'use-cache-layer' }]);
  await context.tasks.setStatus(id, 'complete');
  await context.tasks.setBaseBranch(id, baseBranch);
  const task = await context.tasks.get(id);
  assert.ok(task);
  return task;
};

/**
 * Returns the session `id` to register, an orchestrator for no task unless `overrides` says otherwise.
 */
const session = (id: string, overrides: Partial<RegisteredSession> = {}): RegisteredSession => ({
  id,
  agent: 'claude',
  directory: '/repository',
  startedAt: 0,
  role: 'orchestrator',
  parentId: null,
  taskId: null,
  job: null,
  ticketId: null,
  alias: null,
  contextTokens: null,
  model: null,
  effort: null,
  ...overrides,
});

/**
 * Returns fake worktrees whose `deleteTask` records the task id, the base branch and the force of each call in
 * `calls`, and returns `DELETED`.
 */
const deletingWorktrees = (calls: unknown[][]): Worktrees => ({
  ...NO_WORKTREES,
  deleteTask: async (task, baseBranch, force) => {
    calls.push([task.id, baseBranch, force]);
    return DELETED;
  },
});

/**
 * Returns a validation of `assert.rejects` that accepts an `RpcError` of the code `code` whose message fits `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

describe('taskDelete', () => {
  it('returns the id and the slug of the task with the removed worktrees and no subagents', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    assert.deepEqual(await testCall(taskDeleteMethod, { task: task.id }, context), {
      taskId: task.id,
      slug: SLUG,
      worktrees: DELETED,
      subagents: [],
    });
  });

  it('deletes the task from the task store', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(taskDeleteMethod, { task: task.id }, context);
    assert.equal(await context.tasks.get(task.id), undefined);
  });

  it('deletes the task that its slug names', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    const result = await testCall(taskDeleteMethod, { task: SLUG }, context);
    assert.equal(result.taskId, task.id);
    assert.equal(await context.tasks.get(task.id), undefined);
  });

  it('deletes the task that its id and its slug name', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(taskDeleteMethod, { task: `${task.id}-${SLUG}` }, context);
    assert.equal(await context.tasks.get(task.id), undefined);
  });

  it('passes the task, its base branch and force to the worktrees', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const first = await storedTask(context, 'develop');
    const second = await storedTask(context, null);
    await testCall(taskDeleteMethod, { task: first.id }, context);
    await testCall(taskDeleteMethod, { task: second.id, force: true }, context);
    assert.deepEqual(calls, [
      [first.id, 'develop', false],
      [second.id, null, true],
    ]);
  });

  it('deletes the subagents of the task and lists them', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    await context.sessions.register(session('orchestrator-1'));
    for (const id of ['subagent-1', 'subagent-2'])
      await context.sessions.register(
        session(id, { role: 'subagent', parentId: 'orchestrator-1', taskId: task.id, job: 'implement' }),
      );
    const result = await testCall(taskDeleteMethod, { task: task.id }, context);
    assert.deepEqual(result.subagents, ['subagent-1', 'subagent-2']);
    assert.equal(await context.sessions.get('subagent-1'), undefined);
    assert.equal(await context.sessions.get('subagent-2'), undefined);
  });

  it('keeps the subagents of other tasks and every orchestrator session', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    const other = await storedTask(context);
    await context.sessions.register(session('orchestrator-1', { taskId: task.id }));
    await context.sessions.register(
      session('subagent-1', { role: 'subagent', parentId: 'orchestrator-1', taskId: other.id }),
    );
    await context.sessions.register(session('subagent-2', { role: 'subagent', parentId: 'orchestrator-1' }));
    const result = await testCall(taskDeleteMethod, { task: task.id }, context);
    assert.deepEqual(result.subagents, []);
    assert.deepEqual(
      (await context.sessions.list()).map(({ id }) => id),
      ['orchestrator-1', 'subagent-1', 'subagent-2'],
    );
  });

  it('releases the claims of the tickets after the deletion', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: deletingWorktrees([]) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, caller);
    await testCall(taskDeleteMethod, { task: task.id }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  it('rejects a refusal of the worktrees with an invalid request and keeps the task', async () => {
    const deleteTask = async (): Promise<never> => {
      throw REFUSAL;
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, deleteTask } });
    const task = await storedTask(context);
    await assert.rejects(testCall(taskDeleteMethod, { task: task.id }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, message: error.message, data: error.data },
        { code: RPC_ERROR_CODES.INVALID_REQUEST, message: REFUSAL.message, data: { kind: 'not-allowed', files: [] } },
      );
      return true;
    });
    assert.deepEqual(await context.tasks.get(task.id), task);
  });

  it('keeps the subagents of the task when the worktrees refuse', async () => {
    const deleteTask = async (): Promise<never> => {
      throw REFUSAL;
    };
    const context = testMethodContext({ worktrees: { ...NO_WORKTREES, deleteTask } });
    const task = await storedTask(context);
    await context.sessions.register(session('orchestrator-1'));
    await context.sessions.register(
      session('subagent-1', { role: 'subagent', parentId: 'orchestrator-1', taskId: task.id }),
    );
    await assert.rejects(testCall(taskDeleteMethod, { task: task.id }, context), RpcError);
    assert.notEqual(await context.sessions.get('subagent-1'), undefined);
  });

  it('rejects a task with a ticket that another session holds with an invalid request and deletes nothing', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 2, testConnection());
    await assert.rejects(
      testCall(taskDeleteMethod, { task: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 2 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
    assert.deepEqual(await context.tasks.get(task.id), task);
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    await assert.rejects(
      testCall(taskDeleteMethod, { task: 9 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a slug that no task has with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: deletingWorktrees([]) });
    await assert.rejects(
      testCall(taskDeleteMethod, { task: SLUG }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task has the slug cache-layer-redis/),
    );
  });

  it('rejects a slug that several tasks have with invalid parameters that list each of them', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: deletingWorktrees(calls) });
    const first = await storedTask(context);
    const second = await storedTask(context);
    await assert.rejects(
      testCall(taskDeleteMethod, { task: SLUG }, context),
      rpcError(
        RPC_ERROR_CODES.INVALID_PARAMS,
        new RegExp(`Several tasks have the slug ${SLUG}: ${first.id}-${SLUG}, ${second.id}-${SLUG}`),
      ),
    );
    assert.deepEqual(calls, []);
  });
});
