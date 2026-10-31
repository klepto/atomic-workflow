import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LoggedMessage } from '@/api/types.ts';
import { sessionBreaks, visibleMessages } from '@/console/visible-messages.ts';

/**
 * Returns a logged message with the fields `fields`: by default a message of the agent in the session `session`.
 */
const message = (fields: Partial<LoggedMessage> & Pick<LoggedMessage, 'id'>): LoggedMessage => ({
  sessionId: 'session',
  messageId: null,
  sender: 'agent',
  content: 'text',
  timestamp: 0,
  ...fields,
});

describe('visibleMessages', () => {
  it('keeps a message without marked quotes as it is', () => {
    const logged = [message({ id: 1, content: 'The reply' })];
    assert.deepEqual(visibleMessages(logged), logged);
  });

  it('removes the marked quotes of the atomic-workflow server around a message', () => {
    const logged = [message({ id: 1, content: 'atomic-workflow:\n> prompt\n\nThe reply\n\natomic-workflow:\n> done' })];
    assert.deepEqual(visibleMessages(logged), [message({ id: 1, content: 'The reply' })]);
  });

  it('hides a message that holds only marked quotes', () => {
    const logged = [message({ id: 1, content: 'atomic-workflow:\n> done' }), message({ id: 2, content: 'Next' })];
    assert.deepEqual(
      visibleMessages(logged).map(({ id }) => id),
      [2],
    );
  });

  it('hides a notification that a background task ended', () => {
    const logged = [
      message({ id: 1, sender: 'user', content: '<task-notification><status>completed</status></task-notification>' }),
      message({ id: 2, content: 'Next' }),
    ];
    assert.deepEqual(
      visibleMessages(logged).map(({ id }) => id),
      [2],
    );
  });

  it('hides a message that holds only whitespace', () => {
    assert.deepEqual(visibleMessages([message({ id: 1, content: ' \n ' })]), []);
  });

  it('keeps a marked quote in the middle of a message', () => {
    const logged = [message({ id: 1, content: 'Before\natomic-workflow:\n> middle\nAfter' })];
    assert.deepEqual(visibleMessages(logged), logged);
  });

  it('merges a shell command of the bash mode with its output that follows it', () => {
    const logged = [
      message({ id: 1, sender: 'user', content: '<bash-input>ls</bash-input>' }),
      message({ id: 2, sender: 'user', content: '<bash-stdout>a.ts</bash-stdout><bash-stderr></bash-stderr>' }),
    ];
    assert.deepEqual(visibleMessages(logged), [
      message({
        id: 1,
        sender: 'user',
        content: '<bash-input>ls</bash-input><bash-stdout>a.ts</bash-stdout><bash-stderr></bash-stderr>',
      }),
    ]);
  });

  it('keeps a shell command of the bash mode apart from an output of another session', () => {
    const logged = [
      message({ id: 1, sessionId: 'a', sender: 'user', content: '<bash-input>ls</bash-input>' }),
      message({ id: 2, sessionId: 'b', sender: 'user', content: '<bash-stdout>a.ts</bash-stdout>' }),
    ];
    assert.deepEqual(visibleMessages(logged), logged);
  });

  it('keeps a shell command of the bash mode apart from a message that is no output', () => {
    const logged = [
      message({ id: 1, sender: 'user', content: '<bash-input>ls</bash-input>' }),
      message({ id: 2, sender: 'user', content: 'Next' }),
    ];
    assert.deepEqual(visibleMessages(logged), logged);
  });
});

describe('sessionBreaks', () => {
  it('returns no break for no messages', () => {
    assert.deepEqual(sessionBreaks([]), new Set());
  });

  it('returns no break for the messages of one session', () => {
    assert.deepEqual(sessionBreaks([message({ id: 1 }), message({ id: 2 })]), new Set());
  });

  it('returns the id of each message of another session than the message before it', () => {
    const entries = [
      message({ id: 1, sessionId: 'a' }),
      message({ id: 2, sessionId: 'b' }),
      message({ id: 3, sessionId: 'b' }),
      message({ id: 4, sessionId: 'a' }),
    ];
    assert.deepEqual(sessionBreaks(entries), new Set([2, 4]));
  });
});
