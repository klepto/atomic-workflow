import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Chat } from '@/chats/chat-list.ts';
import { chatWords } from '@/console/chat-words.ts';

/**
 * Returns a chat with the fields `fields`: by default the chat of an ended subagent.
 */
const chat = (fields: Partial<Chat>): Chat => ({
  key: 'agent',
  name: 'agent',
  label: 'agent',
  ref: 'agent',
  role: 'subagent',
  sessionIds: ['agent'],
  taskOrchestrator: false,
  sessionId: undefined,
  status: 'ended',
  turnStartedAt: null,
  latestAction: null,
  startedAt: null,
  lastActivityAt: null,
  contextTokens: null,
  model: null,
  effort: null,
  logQuery: { sessionId: 'agent' },
  ...fields,
});

describe('chatWords', () => {
  it('names the chat of the main session the main session', () => {
    assert.equal(chatWords(chat({ role: 'orchestrator', label: 'main session' })), 'the main session');
  });

  it('names the chat of a subagent by its label', () => {
    assert.equal(chatWords(chat({ label: 'plan-web' })), 'plan-web');
  });
});
