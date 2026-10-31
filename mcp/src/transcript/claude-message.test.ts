import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMessage } from './claude-message.ts';

/**
 * Time of the entries of the tests.
 */
const TIMESTAMP = '2026-10-31T10:00:00.000Z';

/**
 * Returns an entry of a Claude Code transcript of the type `type` with the content `content`, and the fields of
 * `fields` on top.
 */
const entry = (type: string, content: unknown, fields: object = {}): object => ({
  type,
  uuid: 'message-1',
  timestamp: TIMESTAMP,
  message: { content },
  ...fields,
});

/**
 * Returns the message that `parseMessage` finds in the line of the entry `value`, with `sidechain` and `awaitIds`.
 */
const messageOf = (value: object, sidechain = false, awaitIds = new Set<string>()): ReturnType<typeof parseMessage> =>
  parseMessage(JSON.stringify(value), value, sidechain, awaitIds);

/**
 * Entry of the agent that runs a wait for the messages of the atomic-workflow server in the call `call-1`.
 */
const AWAIT_CALL = entry('assistant', [
  { type: 'tool_use', id: 'call-1', input: { command: 'node /plugin/dist/await-command.mjs session-1' } },
]);

/**
 * Entry of the result of the call `call-1`, which started the background task `task-1`.
 */
const AWAIT_RESULT = entry('user', [{ type: 'tool_result', tool_use_id: 'call-1' }], {
  toolUseResult: { backgroundTaskId: 'task-1' },
});

describe('parseMessage', () => {
  it('returns a message of the user', () => {
    assert.deepEqual(messageOf(entry('user', 'Hello')), {
      messageId: 'message-1',
      sender: 'user',
      content: 'Hello',
      timestamp: Date.parse(TIMESTAMP),
    });
  });

  it('returns a message of the agent with its text blocks', () => {
    const value = entry('assistant', [
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
    assert.deepEqual(messageOf(value), {
      messageId: 'message-1',
      sender: 'agent',
      content: 'First\n\nSecond',
      timestamp: Date.parse(TIMESTAMP),
    });
  });

  it('returns a message of a subagent with sidechain only', () => {
    const value = entry('user', 'Hello', { isSidechain: true });
    assert.equal(messageOf(value, false), undefined);
    assert.equal(messageOf(value, true)?.content, 'Hello');
    assert.equal(messageOf(entry('user', 'Hello'), true), undefined);
  });

  it('skips an entry that only Claude Code wrote', () => {
    assert.equal(messageOf(entry('user', 'Base directory for this skill', { isMeta: true })), undefined);
  });

  it('skips the summary of a compaction', () => {
    assert.equal(messageOf(entry('user', 'Summary', { isCompactSummary: true })), undefined);
  });

  it('skips tool calls, tool results and thinking', () => {
    assert.equal(messageOf(entry('assistant', [{ type: 'tool_use', id: 'call-1' }])), undefined);
    assert.equal(messageOf(entry('user', [{ type: 'tool_result', tool_use_id: 'call-1' }])), undefined);
    assert.equal(messageOf(entry('assistant', [{ type: 'thinking', thinking: 'Hmm' }])), undefined);
  });

  it('skips an entry of another type', () => {
    assert.equal(messageOf(entry('system', 'Hello')), undefined);
  });

  it('skips a value that is no entry', () => {
    assert.equal(parseMessage('{"type":', undefined, false, new Set()), undefined);
    assert.equal(messageOf({ type: 'user', uuid: 'message-1', message: { content: 'Hello' } }), undefined);
  });

  it('skips the notice of the user that names the background task of a wait', () => {
    const awaitIds = new Set<string>();
    messageOf(AWAIT_CALL, false, awaitIds);
    messageOf(AWAIT_RESULT, false, awaitIds);
    assert.equal(messageOf(entry('user', 'Background task task-1 completed'), false, awaitIds), undefined);
    assert.equal(messageOf(entry('user', 'Call call-1 ended'), false, awaitIds), undefined);
  });

  it('keeps the ids of a wait in awaitIds for the other transcripts', () => {
    const awaitIds = new Set<string>();
    messageOf(AWAIT_CALL, false, awaitIds);
    messageOf(AWAIT_RESULT, false, awaitIds);
    assert.deepEqual([...awaitIds], ['call-1', 'task-1']);
  });

  it('keeps a message of the user that names no wait, and a message of the agent that names one', () => {
    const awaitIds = new Set<string>();
    messageOf(AWAIT_CALL, false, awaitIds);
    messageOf(AWAIT_RESULT, false, awaitIds);
    assert.equal(messageOf(entry('user', 'Background task task-2 completed'), false, awaitIds)?.sender, 'user');
    assert.equal(messageOf(entry('assistant', 'The task task-1 runs'), false, awaitIds)?.sender, 'agent');
  });

  it('keeps no id of a call that runs another command', () => {
    const awaitIds = new Set<string>();
    messageOf(
      entry('assistant', [{ type: 'tool_use', id: 'call-1', input: { command: 'npm test' } }]),
      false,
      awaitIds,
    );
    assert.deepEqual([...awaitIds], []);
  });
});
