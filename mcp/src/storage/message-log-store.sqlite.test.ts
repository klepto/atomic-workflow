import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { testStorage } from '../testing/test-storage.ts';
import type { MessageLogStore, MessageQuery, NewMessage } from './message-log-store.ts';

/**
 * Failure of a write that breaks a constraint of the database, as `node:sqlite` throws it.
 */
const CONSTRAINT_FAILURE = { name: 'Error', code: 'ERR_SQLITE_ERROR', errstr: 'constraint failed' };

/**
 * Query of the latest 10 messages of every session.
 */
const EVERY_MESSAGE: MessageQuery = { sessionId: undefined, alias: undefined, after: undefined, limit: 10 };

/**
 * Returns the message log store of a new `testStorage`, which `after` of `context` closes, with the orchestrator
 * session `session-1` of the alias `main` and the subagent `session-2` of the alias `cache-worker` inside it
 * registered.
 */
const messageLogStore = async (context: TestContext): Promise<MessageLogStore> => {
  const storage = testStorage();
  context.after(() => storage.close());
  const { sessions, messageLog } = storage;
  const session = {
    agent: 'claude',
    directory: '/repository',
    startedAt: 1,
    taskId: null,
    job: null,
    ticketId: null,
    contextTokens: null,
    model: null,
    effort: null,
  } as const;
  await sessions.register({ ...session, id: 'session-1', role: 'orchestrator', alias: 'main', parentId: null });
  await sessions.register({
    ...session,
    id: 'session-2',
    role: 'subagent',
    alias: 'cache-worker',
    parentId: 'session-1',
  });
  return messageLog;
};

/**
 * Returns a message to add to the log, a message of the user in `session-1` with no message id, with the fields of
 * `fields` instead.
 */
const message = (fields: Partial<NewMessage> = {}): NewMessage => ({
  sessionId: 'session-1',
  messageId: null,
  sender: 'user',
  content: 'Hello',
  timestamp: 5,
  ...fields,
});

/**
 * Adds a message with each content of `list` to `messageLog`, in order, with the fields of `fields`.
 */
const appendAll = async (
  messageLog: MessageLogStore,
  list: readonly string[],
  fields: Partial<NewMessage> = {},
): Promise<void> => {
  for (const content of list) await messageLog.append(message({ ...fields, content }));
};

/**
 * Returns the contents of the messages that `query` selects from `messageLog`, in the order of the log.
 */
const contents = async (messageLog: MessageLogStore, query: Partial<MessageQuery> = {}): Promise<string[]> =>
  (await messageLog.list({ ...EVERY_MESSAGE, ...query })).map(({ content }) => content);

describe('sqliteMessageLogStore', () => {
  describe('append', () => {
    it('adds the message to the end of the log, and returns it as logged', async (context) => {
      const messageLog = await messageLogStore(context);
      const logged = await messageLog.append(message({ messageId: 'message-1', sender: 'agent', content: 'Done' }));
      assert.deepEqual(logged, { ...message({ messageId: 'message-1', sender: 'agent', content: 'Done' }), id: 1 });
      assert.deepEqual(await messageLog.list(EVERY_MESSAGE), [logged]);
    });

    it('gives a message added later a greater identifier', async (context) => {
      const messageLog = await messageLogStore(context);
      const first = await messageLog.append(message());
      const second = await messageLog.append(message({ sessionId: 'session-2' }));
      assert.equal(second.id > first.id, true);
    });

    it('returns the logged message for a message id that its session has logged already', async (context) => {
      const messageLog = await messageLogStore(context);
      const logged = await messageLog.append(message({ messageId: 'message-1', content: 'First' }));
      assert.deepEqual(await messageLog.append(message({ messageId: 'message-1', content: 'Again' })), logged);
      assert.deepEqual(await contents(messageLog), ['First']);
    });

    it('adds a message with the message id of a message of another session', async (context) => {
      const messageLog = await messageLogStore(context);
      await messageLog.append(message({ messageId: 'message-1', content: 'First' }));
      await messageLog.append(message({ sessionId: 'session-2', messageId: 'message-1', content: 'Second' }));
      assert.deepEqual(await contents(messageLog), ['First', 'Second']);
    });

    it('adds each message with no message id', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['First', 'Second']);
      assert.deepEqual(await contents(messageLog), ['First', 'Second']);
    });

    it('rejects a message of a session that is not registered', async (context) => {
      const messageLog = await messageLogStore(context);
      await assert.rejects(messageLog.append(message({ sessionId: 'session-3' })), CONSTRAINT_FAILURE);
    });
  });

  describe('list', () => {
    it('returns no message from an empty log', async (context) => {
      assert.deepEqual(await (await messageLogStore(context)).list(EVERY_MESSAGE), []);
    });

    it('returns the latest messages up to the limit in the order of the log without after', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['1', '2', '3', '4']);
      assert.deepEqual(await contents(messageLog, { limit: 2 }), ['3', '4']);
    });

    it('returns the messages after the identifier after up to the limit', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['1', '2', '3', '4']);
      assert.deepEqual(await contents(messageLog, { after: 1, limit: 2 }), ['2', '3']);
      assert.deepEqual(await contents(messageLog, { after: 4 }), []);
    });

    it('returns only the messages of the session sessionId', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['1', '3']);
      await appendAll(messageLog, ['2', '4'], { sessionId: 'session-2' });
      assert.deepEqual(await contents(messageLog, { sessionId: 'session-2' }), ['2', '4']);
      assert.deepEqual(await contents(messageLog, { sessionId: 'session-1', after: 1 }), ['3']);
    });

    it('returns only the messages of the sessions with the alias alias', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['orchestrator']);
      await appendAll(messageLog, ['subagent'], { sessionId: 'session-2' });
      assert.deepEqual(await contents(messageLog, { alias: 'main' }), ['orchestrator']);
      assert.deepEqual(await contents(messageLog, { alias: 'cache-worker', after: 0 }), ['subagent']);
      assert.deepEqual(await contents(messageLog, { alias: 'missing' }), []);
    });
  });

  describe('deleteSession', () => {
    it('deletes every message of the session, and returns how many it deleted', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['1', '2']);
      await appendAll(messageLog, ['3'], { sessionId: 'session-2' });
      assert.equal(await messageLog.deleteSession('session-1'), 2);
      assert.deepEqual(await contents(messageLog), ['3']);
    });

    it('returns 0 for a session with no message', async (context) => {
      const messageLog = await messageLogStore(context);
      await appendAll(messageLog, ['1']);
      assert.equal(await messageLog.deleteSession('session-2'), 0);
      assert.deepEqual(await contents(messageLog), ['1']);
    });
  });

  describe('latestTimes', () => {
    it('returns the time of the latest message of each session that has a message', async (context) => {
      const messageLog = await messageLogStore(context);
      await messageLog.append(message({ timestamp: 9 }));
      await messageLog.append(message({ timestamp: 7 }));
      await messageLog.append(message({ sessionId: 'session-2', timestamp: 3 }));
      assert.deepEqual(
        await messageLog.latestTimes(),
        new Map([
          ['session-1', 9],
          ['session-2', 3],
        ]),
      );
    });

    it('returns an empty map for an empty log', async (context) => {
      assert.deepEqual(await (await messageLogStore(context)).latestTimes(), new Map());
    });
  });
});
