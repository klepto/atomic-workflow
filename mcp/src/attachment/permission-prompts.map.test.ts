import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testConnection } from '../testing/test-connection.ts';
import { mapCreatePermissionPrompts } from './permission-prompts.map.ts';
import type { NewPermissionPrompt } from './permission-prompts.ts';

/**
 * Promise of a client that never goes away on its own.
 */
const NEVER_CLOSED = new Promise<void>(() => undefined);

/**
 * Returns a prompt to open, with the fields of `fields` over a Bash call of the main thread of `main`.
 */
const prompt = (fields: Partial<NewPermissionPrompt> = {}): NewPermissionPrompt => ({
  sessionId: 'main',
  agentType: null,
  toolName: 'Bash',
  toolInput: { command: 'ls' },
  suggestions: [],
  openedAt: 0,
  ...fields,
});

describe('mapCreatePermissionPrompts', () => {
  describe('open', () => {
    it('returns the prompt with a new identifier and every field that it was opened with', () => {
      const prompts = mapCreatePermissionPrompts();
      const opened = prompt({ agentType: 'worker', suggestions: [{ type: 'addRules' }], openedAt: 5 });
      assert.deepEqual(prompts.open(opened, NEVER_CLOSED).prompt, { id: '1', ...opened });
    });

    it('gives each prompt an identifier of its own', () => {
      const prompts = mapCreatePermissionPrompts();
      const first = prompts.open(prompt(), NEVER_CLOSED).prompt;
      const second = prompts.open(prompt(), NEVER_CLOSED).prompt;
      assert.notEqual(first.id, second.id);
    });

    it('closes the prompt without an answer once its client goes away', async () => {
      const prompts = mapCreatePermissionPrompts();
      const connection = testConnection();
      const { prompt: opened, answer } = prompts.open(prompt(), connection.closed);
      connection.close();
      assert.equal(await answer, undefined);
      assert.equal(prompts.get(opened.id), undefined);
      assert.deepEqual(prompts.list(), []);
    });
  });

  describe('list', () => {
    it('returns every open prompt, the oldest first', () => {
      const prompts = mapCreatePermissionPrompts();
      const first = prompts.open(prompt({ toolName: 'Bash' }), NEVER_CLOSED).prompt;
      const second = prompts.open(prompt({ toolName: 'Edit' }), NEVER_CLOSED).prompt;
      assert.deepEqual(prompts.list(), [first, second]);
    });
  });

  describe('get', () => {
    it('returns the open prompt with the identifier', () => {
      const prompts = mapCreatePermissionPrompts();
      const opened = prompts.open(prompt(), NEVER_CLOSED).prompt;
      assert.deepEqual(prompts.get(opened.id), opened);
    });

    it('returns undefined for an identifier of no open prompt', () => {
      assert.equal(mapCreatePermissionPrompts().get('1'), undefined);
    });
  });

  describe('answer', () => {
    it('ends the wait of the prompt with the answer, closes the prompt, and returns true', async () => {
      const prompts = mapCreatePermissionPrompts();
      const { prompt: opened, answer } = prompts.open(prompt(), NEVER_CLOSED);
      assert.equal(prompts.answer(opened.id, { behavior: 'deny', message: 'No' }), true);
      assert.deepEqual(await answer, { behavior: 'deny', message: 'No' });
      assert.deepEqual(prompts.list(), []);
    });

    it('returns false for a prompt that is not open', () => {
      assert.equal(mapCreatePermissionPrompts().answer('1', { behavior: 'allow' }), false);
    });

    it('returns false for a prompt that was answered already, and keeps the first answer', async () => {
      const prompts = mapCreatePermissionPrompts();
      const { prompt: opened, answer } = prompts.open(prompt(), NEVER_CLOSED);
      prompts.answer(opened.id, { behavior: 'allow' });
      assert.equal(prompts.answer(opened.id, { behavior: 'deny', message: 'No' }), false);
      assert.deepEqual(await answer, { behavior: 'allow' });
    });

    it('returns false for a prompt whose client went away', async () => {
      const prompts = mapCreatePermissionPrompts();
      const connection = testConnection();
      const { prompt: opened, answer } = prompts.open(prompt(), connection.closed);
      connection.close();
      await answer;
      assert.equal(prompts.answer(opened.id, { behavior: 'allow' }), false);
    });

    it('leaves the other open prompts open', () => {
      const prompts = mapCreatePermissionPrompts();
      const first = prompts.open(prompt(), NEVER_CLOSED).prompt;
      const second = prompts.open(prompt(), NEVER_CLOSED).prompt;
      prompts.answer(first.id, { behavior: 'allow' });
      assert.deepEqual(prompts.list(), [second]);
    });
  });
});
