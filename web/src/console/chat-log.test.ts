import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RpcCallError } from '@/api/rpc.ts';
import type { LoggedMessage } from '@/api/types.ts';
import { readChatLog } from '@/console/chat-log.ts';
import { fakeCall } from '@/testing/fake-call.ts';

/**
 * Returns a logged message with the id `id`.
 */
const message = (id: number): LoggedMessage => ({
  id,
  sessionId: 'session',
  messageId: null,
  sender: 'agent',
  content: `message ${id}`,
  timestamp: 0,
});

describe('readChatLog', () => {
  it('reads the latest 100 messages on the first read', async () => {
    const { call, calls } = fakeCall({ messageList: () => ({ messages: [message(4), message(7)] }) });
    assert.deepEqual(await readChatLog({ sessionId: 'session' }, undefined, { call }), {
      fresh: [message(4), message(7)],
      greatestId: 7,
    });
    assert.deepEqual(calls, [{ method: 'messageList', params: { sessionId: 'session', limit: 100 } }]);
  });

  it('reads at most 1000 messages after the greatest id on a later read', async () => {
    const { call, calls } = fakeCall({ messageList: () => ({ messages: [message(8)] }) });
    assert.deepEqual(await readChatLog({ alias: 'main' }, 7, { call }), { fresh: [message(8)], greatestId: 8 });
    assert.deepEqual(calls, [{ method: 'messageList', params: { alias: 'main', after: 7, limit: 1000 } }]);
  });

  it('drops the messages at or below the greatest id on a later read', async () => {
    const { call } = fakeCall({ messageList: () => ({ messages: [message(6), message(7), message(9)] }) });
    assert.deepEqual(await readChatLog({ sessionId: 'session' }, 7, { call }), { fresh: [message(9)], greatestId: 9 });
  });

  it('keeps the greatest id when a read finds no message', async () => {
    const { call } = fakeCall({ messageList: () => ({ messages: [] }) });
    assert.deepEqual(await readChatLog({ sessionId: 'session' }, 7, { call }), { fresh: [], greatestId: 7 });
  });

  it('returns the greatest id 0 when the first read finds no message', async () => {
    const { call } = fakeCall({ messageList: () => ({ messages: [] }) });
    assert.deepEqual(await readChatLog({ sessionId: 'session' }, undefined, { call }), { fresh: [], greatestId: 0 });
  });

  it('rejects when the call fails', async () => {
    const { call } = fakeCall({
      messageList: () => {
        throw new RpcCallError('The session is unknown', undefined);
      },
    });
    await assert.rejects(readChatLog({ sessionId: 'session' }, undefined, { call }), {
      name: 'RpcCallError',
      message: 'The session is unknown',
    });
  });
});
