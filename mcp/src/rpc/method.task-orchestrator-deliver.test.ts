import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mapCreateSubagents } from '../attachment/subagents.map.ts';
import { testCall } from '../testing/test-call.ts';
import { testClock } from '../testing/test-clock.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { taskOrchestratorDeliverMethod } from './method.task-orchestrator-deliver.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Promise of an inbox that never closes on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Message to the orchestrator of the task in the tests.
 */
const CONTENT = '/atomic-workflow:approve 1';

/**
 * Options of an orchestrator of the task that a test starts.
 */
interface OrchestratorOptions {
  /**
   * Job of the subagent, `orchestrator` by default.
   */
  readonly job?: string;

  /**
   * Alias of the subagent, the job followed by the slug of the task by default, as a start of the subagent gives it.
   * `null` stands for a subagent stored with no alias.
   */
  readonly alias?: string | null;

  /**
   * Whether the subagent has an open inbox, `true` by default.
   */
  readonly withInbox?: boolean;
}

/**
 * Returns a context with the clock at 40 that holds the task 1, and in which the orchestrator session `main` is
 * registered. Unless `bound` is false, `main` is bound to a connection and has an open inbox. Each new subagent
 * attaches right after `main` was asked to spawn it, as the agent of `main` would start it.
 */
const deliverContext = async (bound = true): Promise<MethodContext> => {
  const subagents = mapCreateSubagents();
  const context = testMethodContext({
    clock: testClock(40),
    subagents,
    awaitCommandLine: (sessionId) => {
      queueMicrotask(() => subagents.attach(sessionId));
      return `await ${sessionId}`;
    },
  });
  const main = { id: 'main', agent: 'claude', directory: '/repository', startedAt: 0, role: 'orchestrator' } as const;
  await context.sessions.register(newSession({ ...main, parentId: null }));
  if (bound) {
    context.sessionConnections.bind('main', testConnection());
    context.inboxes.open('main', NEVER_CLOSED);
  }
  const goal = { summary: 'Cache', details: null, source: 'user' } as const;
  await context.tasks.create({ slug: 'cache-layer-redis', createdAt: 0, goal });
  return context;
};

/**
 * Registers the subagent `sessionId` of `main` in `context`, with the job `job` and the alias `alias` on the task 1,
 * and starts it, attached. Opens its inbox unless `withInbox` is false.
 */
const startOrchestrator = async (
  sessionId: string,
  context: MethodContext,
  { job = 'orchestrator', alias = `${job}-cache-layer-redis`, withInbox = true }: OrchestratorOptions = {},
): Promise<void> => {
  const fields = {
    agent: 'claude',
    directory: '/repository',
    startedAt: 1,
    role: 'subagent',
    parentId: 'main',
  } as const;
  await context.sessions.register(newSession({ ...fields, id: sessionId, taskId: 1, job, alias }));
  const connection = context.sessionConnections.get('main') ?? testConnection();
  context.subagents.start(sessionId, 'main', connection);
  context.subagents.attach(sessionId);
  if (withInbox) context.inboxes.open(sessionId, NEVER_CLOSED);
};

/**
 * Returns the contents of the messages that wait in the inbox of the session `sessionId` of `context`.
 */
const inboxContents = async (sessionId: string, context: MethodContext): Promise<readonly string[]> => {
  const delivery = await context.inboxes.take(sessionId, 0);
  return delivery.status === 'messages' ? delivery.messages.map(({ content }) => content) : [];
};

// The inboxes batch the messages that they deliver with a timer, which must not run for real.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('taskOrchestratorDeliverMethod', () => {
  it('gives the message to the attached orchestrator of the task, and returns its session id', async () => {
    const context = await deliverContext();
    await startOrchestrator('orchestrator-1', context);
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'orchestrator-1' });
    assert.deepEqual(await inboxContents('orchestrator-1', context), [CONTENT]);
  });

  it('logs the message as a message of the user of the orchestrator', async () => {
    const context = await deliverContext();
    await startOrchestrator('orchestrator-1', context);
    await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    const logged = await context.messageLog.list({
      sessionId: 'orchestrator-1',
      alias: undefined,
      after: 0,
      limit: 10,
    });
    assert.deepEqual(
      logged.map(({ sender, content, timestamp }) => ({ sender, content, timestamp })),
      [{ sender: 'user', content: CONTENT, timestamp: 40 }],
    );
  });

  it('gives the message to the latest started orchestrator of the task', async () => {
    const context = await deliverContext();
    await startOrchestrator('orchestrator-1', context);
    await startOrchestrator('orchestrator-2', context);
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'orchestrator-2' });
  });

  it('starts a new orchestrator of the task inside the orchestrator session with the message as its first', async () => {
    const context = await deliverContext();
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'session-1' });
    const session = await context.sessions.get('session-1');
    assert.deepEqual([session?.parentId, session?.taskId, session?.job], ['main', 1, 'orchestrator']);
    assert.deepEqual(await inboxContents('session-1', context), [CONTENT]);
  });

  it('starts a new orchestrator when the orchestrator of the task has no open inbox', async () => {
    const context = await deliverContext();
    await startOrchestrator('orchestrator-1', context, { withInbox: false });
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'session-1' });
  });

  it('starts a new orchestrator when the subagents of the task have other jobs', async () => {
    const context = await deliverContext();
    await startOrchestrator('planner', context, { job: 'plan' });
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'session-1' });
  });

  it('starts a new orchestrator when the orchestrator of the task has no alias', async () => {
    const context = await deliverContext();
    await startOrchestrator('orchestrator-1', context, { alias: null });
    const result = await testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context);
    assert.deepEqual(result, { sessionId: 'session-1' });
  });

  it('rejects a task that does not exist with invalid parameters', async () => {
    await assert.rejects(
      testCall(taskOrchestratorDeliverMethod, { taskId: 9, content: CONTENT }, await deliverContext()),
      {
        name: 'RpcError',
        code: RPC_ERROR_CODES.INVALID_PARAMS,
        message: 'No task 9 exists',
      },
    );
  });

  it('rejects with an invalid request when no orchestrator session is attached to start an orchestrator', async () => {
    const context = await deliverContext(false);
    await assert.rejects(testCall(taskOrchestratorDeliverMethod, { taskId: 1, content: CONTENT }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
      message: 'No orchestrator session is attached',
    });
  });
});
