import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { NewTicket } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { sessionListMethod } from './method.session-list.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Fields of a session that a test does not state.
 */
type SessionFields = Partial<RegisteredSession> & Pick<RegisteredSession, 'id'>;

/**
 * Registers the session with the fields `fields` in `context`: an orchestrator session of `claude` that started at 0,
 * unless `fields` say otherwise.
 */
const register = async (fields: SessionFields, context: MethodContext): Promise<void> => {
  const base = {
    agent: 'claude',
    directory: '/repository',
    startedAt: 0,
    role: 'orchestrator',
    parentId: null,
  } as const;
  await context.sessions.register({ ...newSession({ ...base, id: fields.id }), ...fields });
};

/**
 * Registers the orchestrator session `main` in `context`, and binds it to a new connection.
 */
const attachMain = async (context: MethodContext): Promise<void> => {
  await register({ id: 'main' }, context);
  context.sessionConnections.bind('main', testConnection());
};

/**
 * Registers the subagent `sessionId` of `main` with the fields `fields` in `context`, and starts it, attached.
 */
const attachSubagent = async (fields: SessionFields, context: MethodContext): Promise<void> => {
  await register({ role: 'subagent', parentId: 'main', ...fields }, context);
  context.subagents.start(fields.id, 'main', testConnection());
  context.subagents.attach(fields.id);
};

/**
 * Returns a new ticket of the type `code` with the slug `slug`.
 */
const ticket = (slug: string): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug,
  summary: 'Builds a part of the cache.',
  description: 'Build it.',
  dependsOn: [],
  fixes: null,
});

/**
 * Returns the ids of the sessions that `sessionList` returns for the parameters `params` in `context`, in their order.
 */
const listedIds = async (params: object, context: MethodContext): Promise<readonly string[]> =>
  (await testCall(sessionListMethod, params, context)).sessions.map(({ sessionId }) => sessionId);

describe('sessionListMethod', () => {
  it('returns no session for a repository without one', async () => {
    assert.deepEqual(await testCall(sessionListMethod, {}, testMethodContext()), { sessions: [] });
  });

  it('lists an attached orchestrator session that reported no status as idle, with its details', async () => {
    const context = testMethodContext();
    await register(
      { id: 'main', startedAt: 10, contextTokens: 900, model: 'claude-opus-5-5', effort: 'xhigh' },
      context,
    );
    context.sessionConnections.bind('main', testConnection());
    await context.messageLog.append({
      sessionId: 'main',
      messageId: null,
      sender: 'user',
      content: 'Go',
      timestamp: 20,
    });
    assert.deepEqual(await testCall(sessionListMethod, {}, context), {
      sessions: [
        {
          sessionId: 'main',
          role: 'orchestrator',
          parentId: null,
          attached: true,
          status: 'idle',
          turnStartedAt: null,
          latestAction: null,
          taskId: null,
          ticketId: null,
          job: null,
          alias: null,
          name: 'main',
          startedAt: 10,
          lastActivityAt: 20,
          contextTokens: 900,
          model: 'claude-opus-5-5',
          effort: 'xhigh',
        },
      ],
    });
  });

  it('lists a registered session that is not attached as ended', async () => {
    const context = testMethodContext();
    await register({ id: 'main', startedAt: 10 }, context);
    const [session] = (await testCall(sessionListMethod, {}, context)).sessions;
    assert.deepEqual(
      [session?.attached, session?.status, session?.turnStartedAt, session?.latestAction, session?.lastActivityAt],
      [false, 'ended', null, null, null],
    );
  });

  it('lists the attached sessions first, the subagents after the bound sessions, then the others by their start', async () => {
    const context = testMethodContext();
    await register({ id: 'old', startedAt: 1 }, context);
    await attachMain(context);
    await register({ id: 'ended', role: 'subagent', parentId: 'main', startedAt: 2 }, context);
    await attachSubagent({ id: 'sub', startedAt: 3 }, context);
    assert.deepEqual(await listedIds({}, context), ['main', 'sub', 'old', 'ended']);
  });

  it('lists only the attached sessions for attached true, and only the others for attached false', async () => {
    const context = testMethodContext();
    await register({ id: 'old' }, context);
    await attachMain(context);
    await attachSubagent({ id: 'sub' }, context);
    assert.deepEqual(await listedIds({ attached: true }, context), ['main', 'sub']);
    assert.deepEqual(await listedIds({ attached: false }, context), ['old']);
  });

  it('shows the status, the start of the turn and the newest action that the session reported', async () => {
    const context = testMethodContext();
    await attachMain(context);
    context.activity.report('main', 'working', 5);
    context.activity.reportAction('main', 'Bash: npm test', 6);
    const [session] = (await testCall(sessionListMethod, {}, context)).sessions;
    assert.deepEqual(
      [session?.status, session?.turnStartedAt, session?.latestAction],
      ['working', 5, 'Bash: npm test'],
    );
  });

  it('lists an attached subagent with its parent, its work and its alias', async () => {
    const context = testMethodContext();
    await attachMain(context);
    await attachSubagent({ id: 'sub', taskId: 4, ticketId: 2, job: 'implement', alias: 'Cache builder' }, context);
    const listed = (await testCall(sessionListMethod, {}, context)).sessions.find(
      ({ sessionId }) => sessionId === 'sub',
    );
    assert.deepEqual(
      [listed?.role, listed?.parentId, listed?.taskId, listed?.ticketId, listed?.job, listed?.alias, listed?.name],
      ['subagent', 'main', 4, 2, 'implement', 'Cache builder', 'Cache builder'],
    );
  });

  it('names each subagent by its job and the slug of its target, with a number for a name that is taken', async () => {
    const context = testMethodContext();
    await attachMain(context);
    const goal = { summary: 'Cache', details: null, source: 'user' } as const;
    const task = await context.tasks.create({ slug: 'cache-layer-redis', createdAt: 0, goal });
    await context.tasks.setTickets(task.id, [ticket('cache-key-format')]);
    await attachSubagent({ id: 'plan-1', startedAt: 1, taskId: task.id, job: 'plan' }, context);
    await attachSubagent({ id: 'plan-2', startedAt: 2, taskId: task.id, job: 'plan' }, context);
    await attachSubagent({ id: 'build', startedAt: 3, taskId: task.id, ticketId: 1, job: 'implement' }, context);
    await attachSubagent({ id: '1a2b3c4d5e6f', startedAt: 4 }, context);
    const names = (await testCall(sessionListMethod, {}, context)).sessions.map(({ name }) => name);
    assert.deepEqual(names, [
      'main',
      'plan-cache-layer-redis',
      'plan-cache-layer-redis-2',
      'implement-cache-key-format',
      'agent-1a2b3c4d',
    ]);
  });

  it('lists an attached session that is not registered with no details and the name of its role', async () => {
    const context = testMethodContext();
    context.sessionConnections.bind('main', testConnection());
    const [session] = (await testCall(sessionListMethod, {}, context)).sessions;
    assert.deepEqual([session?.name, session?.startedAt, session?.job, session?.attached], ['main', null, null, true]);
  });

  it('rejects an attached filter that is no boolean with invalid parameters', async () => {
    await assert.rejects(testCall(sessionListMethod, { attached: 'yes' }, testMethodContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
