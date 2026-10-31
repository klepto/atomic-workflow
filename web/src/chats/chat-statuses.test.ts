import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHAT_STATUSES } from '@/chats/chat-statuses.ts';

describe('CHAT_STATUSES', () => {
  it('gives each status its own dot and its own words', () => {
    const looks = Object.values(CHAT_STATUSES);
    assert.equal(new Set(looks.map((look) => look.dot)).size, looks.length);
    assert.equal(new Set(looks.map((look) => look.words)).size, looks.length);
  });

  it('says that a waiting chat waits for the user', () => {
    assert.equal(CHAT_STATUSES.waiting.words, 'waits for you');
  });
});
