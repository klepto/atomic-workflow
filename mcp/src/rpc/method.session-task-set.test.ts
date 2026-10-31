import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type RegisteredSession, SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionTaskSetMethod } from './method.session-task-set.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Registers the orchestrator session `main` in `context`, and its subagent `sub` with the fields `fields`.
 */
const registerSubagent = async (context: MethodContext, fields: Partial<RegisteredSession> = {}): Promise<void> => {
  const base = { agent: 'claude', directory: '/repository', startedAt: 0 } as const;
  await context.sessions.register(newSession({ ...base, id: 'main', role: 'orchestrator', parentId: null }));
  await context.sessions.register({
    ...newSession({ ...base, id: 'sub', role: 'subagent', parentId: 'main' }),
    ...fields,
  });
};

/**
 * Stores a task with the slug `slug` in `context`, and returns its id.
 */
const storedTask = async (context: MethodContext, slug: string): Promise<number> => {
  const goal = { summary: 'Cache', details: null, source: 'user' } as const;
  return (await context.tasks.create({ slug, createdAt: 0, goal })).id;
};

/**
 * Returns the alias of the subagent `sub` of `context`.
 */
const subAlias = async (context: MethodContext): Promise<string | null | undefined> =>
  (await context.sessions.get('sub'))?.alias;

describe('sessionTaskSetMethod', () => {
  it('sets the task of a subagent that works on no task', async () => {
    const context = testMethodContext();
    await registerSubagent(context);
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId: 3 }, context);
    assert.equal((await context.sessions.get('sub'))?.taskId, 3);
  });

  it('keeps the task of a subagent that works on a task already', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1 });
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId: 3 }, context);
    assert.equal((await context.sessions.get('sub'))?.taskId, 1);
  });

  it('moves a subagent to the task that it created, with no ticket', async () => {
    const context = testMethodContext();
    await registerSubagent(context, { taskId: 1, job: 'implement', ticketId: 2 });
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId: 3, created: true }, context);
    const session = await context.sessions.get('sub');
    assert.deepEqual([session?.taskId, session?.ticketId], [3, null]);
  });

  it('sets no task for an orchestrator session', async () => {
    const context = testMethodContext();
    await registerSubagent(context);
    await testCall(sessionTaskSetMethod, { sessionId: 'main', taskId: 3, created: true }, context);
    assert.equal((await context.sessions.get('main'))?.taskId, null);
  });

  it('gives a subagent with no job that created the task the alias plan and the slug of the task', async () => {
    const context = testMethodContext();
    const taskId = await storedTask(context, 'cache-layer');
    await registerSubagent(context);
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId, created: true }, context);
    assert.equal(await subAlias(context), 'plan-cache-layer');
  });

  it('gives a subagent with a job the alias of its job and the slug of its task', async () => {
    const context = testMethodContext();
    const taskId = await storedTask(context, 'cache-layer');
    await registerSubagent(context, { job: 'plan-design' });
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId }, context);
    assert.equal(await subAlias(context), 'plan-design-cache-layer');
  });

  it('cuts the alias of the subagent to the greatest length of an alias', async () => {
    const context = testMethodContext();
    const taskId = await storedTask(context, 'a'.repeat(100));
    await registerSubagent(context);
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId, created: true }, context);
    assert.equal(await subAlias(context), `plan-${'a'.repeat(SESSION_ALIAS_MAX_LENGTH - 5)}`);
  });

  it('gives no alias to a subagent with no job that read the task', async () => {
    const context = testMethodContext();
    const taskId = await storedTask(context, 'cache-layer');
    await registerSubagent(context);
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId }, context);
    assert.equal(await subAlias(context), null);
  });

  it('keeps the alias of a subagent that holds one', async () => {
    const context = testMethodContext();
    const taskId = await storedTask(context, 'cache-layer');
    await registerSubagent(context, { alias: 'Cache planner' });
    await testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId, created: true }, context);
    assert.equal(await subAlias(context), 'Cache planner');
  });

  it('rejects a session that is not registered with invalid parameters', async () => {
    await assert.rejects(testCall(sessionTaskSetMethod, { sessionId: 'sub', taskId: 3 }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'No session sub is registered',
    });
  });
});
