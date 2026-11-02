import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { feedPublishChanges } from '../changes/publish-changes.feed.ts';
import { testCall } from '../testing/test-call.ts';
import { type TestChangeFeed, testChangeFeed } from '../testing/test-change-feed.ts';
import { testClock } from '../testing/test-clock.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { permissionPromptOpenMethod } from './method.permission-prompt-open.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Context of a test whose services publish to a feed.
 */
interface PublishingContext {
  /**
   * Services of the method, which publish to `feed`.
   */
  readonly context: MethodContext;

  /**
   * Feed that the services publish to.
   */
  readonly feed: TestChangeFeed;
}

/**
 * Parameters of `permissionPromptOpen` for a Bash call of the main thread of the session `main`.
 */
const PARAMS = {
  sessionId: 'main',
  agentId: null,
  agentType: null,
  toolName: 'Bash',
  toolInput: { command: 'npm test' },
  suggestions: [],
};

/**
 * Returns a `testMethodContext` with the fields of `overrides`, whose services publish to a new `TestChangeFeed`.
 */
const publishingContext = (overrides: Partial<MethodContext> = {}): PublishingContext => {
  const base = testMethodContext(overrides);
  const feed = testChangeFeed();
  return { context: { ...base, ...feedPublishChanges(base, feed) }, feed };
};

/**
 * Resolves once the calls under way have run up to their next wait for something outside the process.
 */
const settled = async (): Promise<void> => {
  await setImmediate();
};

/**
 * Binds the session server of the session `main` in `context`, with one attached subagent `sub` whose background task
 * is `task-sub`.
 */
const withSubagent = (context: MethodContext): void => {
  const connection = testConnection();
  connection.answer('subagentTaskId', { backgroundTaskId: 'task-sub' });
  context.sessionConnections.bind('main', connection);
  context.subagents.start('sub', 'main', connection);
  context.subagents.attach('sub');
};

/**
 * Returns the session id and the agent type of each open prompt of `context`.
 */
const askers = (context: MethodContext): readonly { sessionId: string; agentType: string | null }[] =>
  context.prompts.list().map(({ sessionId, agentType }) => ({ sessionId, agentType }));

describe('permissionPromptOpenMethod', () => {
  it('adds a prompt with every field, stamped with the time of the clock, and publishes prompts', async () => {
    const { context, feed } = publishingContext({ caller: testConnection(), clock: testClock(1_000) });
    const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }] };
    void testCall(permissionPromptOpenMethod, { ...PARAMS, suggestions: [suggestion] }, context);
    await settled();
    const [prompt] = context.prompts.list();
    assert.ok(prompt !== undefined);
    assert.deepEqual(prompt, {
      id: prompt.id,
      sessionId: 'main',
      agentType: null,
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      suggestions: [suggestion],
      openedAt: 1_000,
    });
    assert.equal(typeof prompt.id, 'string');
    assert.deepEqual(feed.published, ['prompts']);
  });

  it('opens the prompt under the subagent of the session whose background task is the agent id', async () => {
    const context = testMethodContext({ caller: testConnection() });
    withSubagent(context);
    void testCall(permissionPromptOpenMethod, { ...PARAMS, agentId: 'task-sub', agentType: 'worker' }, context);
    await settled();
    assert.deepEqual(askers(context), [{ sessionId: 'sub', agentType: 'worker' }]);
  });

  it('opens the prompt under the session, with its agent type, for an agent id of no known subagent', async () => {
    const context = testMethodContext({ caller: testConnection() });
    withSubagent(context);
    void testCall(permissionPromptOpenMethod, { ...PARAMS, agentId: 'task-other', agentType: 'Explore' }, context);
    await settled();
    assert.deepEqual(askers(context), [{ sessionId: 'main', agentType: 'Explore' }]);
  });

  it('opens the prompt under the session when its session server is not attached', async () => {
    const context = testMethodContext({ caller: testConnection() });
    void testCall(permissionPromptOpenMethod, { ...PARAMS, agentId: 'task-sub', agentType: 'worker' }, context);
    await settled();
    assert.deepEqual(askers(context), [{ sessionId: 'main', agentType: 'worker' }]);
  });

  it('opens the prompt under the session when its session server fails to answer', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const connection = testConnection();
    context.sessionConnections.bind('main', connection);
    context.subagents.start('sub', 'main', testConnection());
    context.subagents.attach('sub');
    connection.close();
    void testCall(permissionPromptOpenMethod, { ...PARAMS, agentId: 'task-sub', agentType: 'worker' }, context);
    await settled();
    assert.deepEqual(askers(context), [{ sessionId: 'main', agentType: 'worker' }]);
  });

  it('leaves out each suggestion that is no object', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const suggestion = { type: 'setMode', mode: 'acceptEdits' };
    void testCall(permissionPromptOpenMethod, { ...PARAMS, suggestions: ['text', null, [1], suggestion] }, context);
    await settled();
    assert.deepEqual(context.prompts.list()[0]?.suggestions, [suggestion]);
  });

  it('resolves with the answer that the prompt gets', async () => {
    const context = testMethodContext({ caller: testConnection() });
    const result = testCall(permissionPromptOpenMethod, PARAMS, context);
    await settled();
    const [prompt] = context.prompts.list();
    assert.ok(prompt !== undefined);
    context.prompts.answer(prompt.id, { behavior: 'deny', message: 'No' });
    assert.deepEqual(await result, { behavior: 'deny', message: 'No' });
  });

  it('drops the prompt and publishes prompts when the connection of the caller closes first', async () => {
    const caller = testConnection();
    const { context, feed } = publishingContext({ caller });
    const result = testCall(permissionPromptOpenMethod, PARAMS, context);
    await settled();
    caller.close();
    await assert.rejects(result, { name: 'RpcError' });
    assert.deepEqual(context.prompts.list(), []);
    assert.deepEqual(feed.published, ['prompts', 'prompts']);
  });

  it('fails with an invalid request without a connection, and adds no prompt', async () => {
    const { context, feed } = publishingContext();
    await assert.rejects(testCall(permissionPromptOpenMethod, PARAMS, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_REQUEST,
    });
    assert.deepEqual(context.prompts.list(), []);
    assert.deepEqual(feed.published, []);
  });

  it('rejects parameters without a tool name with invalid parameters', async () => {
    const context = testMethodContext({ caller: testConnection() });
    await assert.rejects(testCall(permissionPromptOpenMethod, { ...PARAMS, toolName: undefined }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });

  it('is no agent tool', () => {
    assert.equal(permissionPromptOpenMethod.agent, false);
  });
});
