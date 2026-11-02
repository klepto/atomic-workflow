import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RpcCallError } from '@/api/rpc.ts';
import { answerPrompt } from '@/prompts/answer-prompt.ts';
import { fakeCall } from '@/testing/fake-call.ts';

describe('answerPrompt', () => {
  it('allows once with the behavior allow alone', async () => {
    const { call, calls } = fakeCall({});
    assert.equal(await answerPrompt('prompt-1', { behavior: 'allow' }, { call }), true);
    assert.deepEqual(calls, [
      { method: 'permissionPromptAnswer', params: { promptId: 'prompt-1', behavior: 'allow' } },
    ]);
  });

  it('allows always with the suggestion unchanged', async () => {
    const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' };
    const { call, calls } = fakeCall({});
    assert.equal(await answerPrompt('prompt-1', { behavior: 'allow', suggestion }, { call }), true);
    assert.deepEqual(calls, [
      { method: 'permissionPromptAnswer', params: { promptId: 'prompt-1', behavior: 'allow', suggestion } },
    ]);
    assert.equal(calls[0]?.params?.suggestion, suggestion);
  });

  it('denies with the behavior deny', async () => {
    const { call, calls } = fakeCall({});
    assert.equal(await answerPrompt('prompt-1', { behavior: 'deny' }, { call }), true);
    assert.deepEqual(calls, [{ method: 'permissionPromptAnswer', params: { promptId: 'prompt-1', behavior: 'deny' } }]);
  });

  it('resolves to false when the prompt is no longer open', async () => {
    const { call } = fakeCall({
      permissionPromptAnswer: () => {
        throw new RpcCallError('The prompt is no longer open.', undefined);
      },
    });
    assert.equal(await answerPrompt('prompt-1', { behavior: 'allow' }, { call }), false);
  });

  it('resolves to false when the refusal for a prompt that is gone has no final period', async () => {
    const { call } = fakeCall({
      permissionPromptAnswer: () => {
        throw new RpcCallError('The prompt is no longer open', undefined);
      },
    });
    assert.equal(await answerPrompt('prompt-1', { behavior: 'deny' }, { call }), false);
  });

  it('rejects with any other refusal of the server', async () => {
    const { call } = fakeCall({
      permissionPromptAnswer: () => {
        throw new RpcCallError('The suggestion is not one of the prompt', undefined);
      },
    });
    await assert.rejects(answerPrompt('prompt-1', { behavior: 'allow', suggestion: {} }, { call }), {
      name: 'RpcCallError',
      message: 'The suggestion is not one of the prompt',
    });
  });

  it('rejects when the server is not reachable', async () => {
    const { call } = fakeCall({
      permissionPromptAnswer: () => {
        throw new Error('The server is not reachable');
      },
    });
    await assert.rejects(answerPrompt('prompt-1', { behavior: 'allow' }, { call }), {
      message: 'The server is not reachable',
    });
  });
});
