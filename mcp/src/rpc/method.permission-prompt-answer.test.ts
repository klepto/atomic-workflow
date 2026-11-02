import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import type { PermissionAnswer, PermissionPrompt } from '../attachment/permission-prompts.ts';
import { feedPublishChanges } from '../changes/publish-changes.feed.ts';
import { testCall } from '../testing/test-call.ts';
import { type TestChangeFeed, testChangeFeed } from '../testing/test-change-feed.ts';
import { type TestConnection, testConnection } from '../testing/test-connection.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { permissionPromptAnswerMethod } from './method.permission-prompt-answer.ts';
import { permissionPromptOpenMethod } from './method.permission-prompt-open.ts';
import type { MethodContext } from './method.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Suggestion of the prompt of the tests.
 */
const SUGGESTION = {
  type: 'addRules',
  rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
  behavior: 'allow',
  destination: 'localSettings',
};

/**
 * Prompt that a test opened through `permissionPromptOpen`, with the services and the feed of the test.
 */
interface OpenedPrompt {
  /**
   * Services of the methods for a caller without a connection, such as the web app, which publish to `feed`.
   */
  readonly context: MethodContext;

  /**
   * Feed that the services publish to, which holds the publication of the open.
   */
  readonly feed: TestChangeFeed;

  /**
   * Prompt as `permissionPromptList` returns it.
   */
  readonly prompt: PermissionPrompt;

  /**
   * Result of the call of `permissionPromptOpen` that opened the prompt.
   */
  readonly result: Promise<PermissionAnswer>;

  /**
   * Connection of the caller of `permissionPromptOpen`.
   */
  readonly caller: TestConnection;
}

/**
 * Opens a prompt of a Bash call with the suggestion `SUGGESTION` through `permissionPromptOpen`, with services that
 * publish to a new feed.
 */
const openedPrompt = async (): Promise<OpenedPrompt> => {
  const caller = testConnection();
  const base = testMethodContext({ caller });
  const feed = testChangeFeed();
  const context = { ...base, ...feedPublishChanges(base, feed) };
  const result = testCall(
    permissionPromptOpenMethod,
    {
      sessionId: 'main',
      agentId: null,
      agentType: null,
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      suggestions: [SUGGESTION],
    },
    context,
  );
  await setImmediate();
  const [prompt] = context.prompts.list();
  assert.ok(prompt !== undefined);
  return { context: { ...context, caller: undefined }, feed, prompt, result, caller };
};

describe('permissionPromptAnswerMethod', () => {
  it('answers allow once, which drops the prompt and publishes prompts', async () => {
    const { context, feed, prompt, result } = await openedPrompt();
    await testCall(permissionPromptAnswerMethod, { promptId: prompt.id, behavior: 'allow' }, context);
    assert.deepEqual(await result, { behavior: 'allow' });
    assert.deepEqual(context.prompts.list(), []);
    assert.deepEqual(feed.published, ['prompts', 'prompts']);
  });

  it('answers always allow with the suggestion of the prompt as its updated permissions', async () => {
    const { context, feed, prompt, result } = await openedPrompt();
    await testCall(
      permissionPromptAnswerMethod,
      { promptId: prompt.id, behavior: 'allow', suggestion: { ...SUGGESTION } },
      context,
    );
    assert.deepEqual(await result, { behavior: 'allow', updatedPermissions: [SUGGESTION] });
    assert.deepEqual(context.prompts.list(), []);
    assert.deepEqual(feed.published, ['prompts', 'prompts']);
  });

  it('answers deny with the message of the web app', async () => {
    const { context, feed, prompt, result } = await openedPrompt();
    await testCall(permissionPromptAnswerMethod, { promptId: prompt.id, behavior: 'deny' }, context);
    assert.deepEqual(await result, { behavior: 'deny', message: 'Denied in the atomic-workflow web app.' });
    assert.deepEqual(context.prompts.list(), []);
    assert.deepEqual(feed.published, ['prompts', 'prompts']);
  });

  it('fails with invalid parameters for a suggestion that is not one of the prompt, and leaves it open', async () => {
    const { context, feed, prompt } = await openedPrompt();
    await assert.rejects(
      testCall(
        permissionPromptAnswerMethod,
        { promptId: prompt.id, behavior: 'allow', suggestion: { ...SUGGESTION, destination: 'userSettings' } },
        context,
      ),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS },
    );
    assert.deepEqual(context.prompts.list(), [prompt]);
    assert.deepEqual(feed.published, ['prompts']);
  });

  it('fails with invalid parameters for deny with a suggestion, and leaves the prompt open', async () => {
    const { context, feed, prompt } = await openedPrompt();
    await assert.rejects(
      testCall(
        permissionPromptAnswerMethod,
        { promptId: prompt.id, behavior: 'deny', suggestion: SUGGESTION },
        context,
      ),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS },
    );
    assert.deepEqual(context.prompts.list(), [prompt]);
    assert.deepEqual(feed.published, ['prompts']);
  });

  it('fails for an unknown prompt with the message that it is no longer open', async () => {
    await assert.rejects(
      testCall(permissionPromptAnswerMethod, { promptId: '7', behavior: 'allow' }, testMethodContext()),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS, message: 'The prompt is no longer open.' },
    );
  });

  it('fails for a prompt whose caller went away with the message that it is no longer open', async () => {
    const { context, prompt, result, caller } = await openedPrompt();
    caller.close();
    await assert.rejects(result);
    await assert.rejects(testCall(permissionPromptAnswerMethod, { promptId: prompt.id, behavior: 'allow' }, context), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'The prompt is no longer open.',
    });
  });

  it('fails for a prompt that was answered already with the message that it is no longer open', async () => {
    const { context, prompt, result } = await openedPrompt();
    await testCall(permissionPromptAnswerMethod, { promptId: prompt.id, behavior: 'allow' }, context);
    await result;
    await assert.rejects(testCall(permissionPromptAnswerMethod, { promptId: prompt.id, behavior: 'deny' }, context), {
      name: 'RpcError',
      message: 'The prompt is no longer open.',
    });
  });

  it('is no agent tool', () => {
    assert.equal(permissionPromptAnswerMethod.agent, false);
  });
});
