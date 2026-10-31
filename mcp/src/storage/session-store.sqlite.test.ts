import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { testStorage } from '../testing/test-storage.ts';
import type { Storage } from './open-storage.ts';
import { type RegisteredSession, SESSION_ALIAS_MAX_LENGTH, type SessionStore } from './session-store.ts';

/**
 * Failure of a write that breaks a constraint of the database, as `node:sqlite` throws it.
 */
const CONSTRAINT_FAILURE = { name: 'Error', code: 'ERR_SQLITE_ERROR', errstr: 'constraint failed' };

/**
 * Returns a new `testStorage`, which `after` of `context` closes.
 */
const storage = (context: TestContext): Storage => {
  const opened = testStorage();
  context.after(() => opened.close());
  return opened;
};

/**
 * Returns the session store of a new `testStorage`, which `after` of `context` closes.
 */
const sessionStore = (context: TestContext): SessionStore => storage(context).sessions;

/**
 * Returns a session to register, an orchestrator session `session-1` of Claude with no task and no usage, with the
 * fields of `fields` instead.
 */
const session = (fields: Partial<RegisteredSession> = {}): RegisteredSession => ({
  id: 'session-1',
  agent: 'claude',
  directory: '/repository',
  startedAt: 5,
  role: 'orchestrator',
  parentId: null,
  taskId: null,
  job: null,
  ticketId: null,
  alias: null,
  contextTokens: null,
  model: null,
  effort: null,
  ...fields,
});

/**
 * Returns the session `id` of `sessions`, and fails the test when it is not registered.
 */
const registered = async (sessions: SessionStore, id: string): Promise<RegisteredSession> => {
  const found = await sessions.get(id);
  assert.ok(found !== undefined, `Session ${id} is not registered`);
  return found;
};

describe('sqliteSessionStore', () => {
  describe('register', () => {
    it('registers the session, and returns it as registered', async (context) => {
      const sessions = sessionStore(context);
      const subagent = session({
        id: 'session-2',
        agent: 'codex',
        role: 'subagent',
        parentId: 'session-1',
        taskId: 3,
        job: 'implement',
        ticketId: 2,
        alias: 'Worker',
        contextTokens: 1_200,
        model: 'gpt-5',
        effort: 'high',
      });
      await sessions.register(session());
      assert.deepEqual(await sessions.register(subagent), subagent);
      assert.deepEqual(await sessions.get('session-2'), subagent);
    });

    it('keeps a session that is registered already, and returns it instead', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await sessions.setAlias('session-1', 'Planner');
      const again = session({ directory: '/other', startedAt: 9 });
      assert.deepEqual(await sessions.register(again), session({ alias: 'Planner' }));
      assert.deepEqual(await sessions.list(), [session({ alias: 'Planner' })]);
    });

    it('accepts an alias of SESSION_ALIAS_MAX_LENGTH characters', async (context) => {
      const alias = 'a'.repeat(SESSION_ALIAS_MAX_LENGTH);
      assert.equal((await sessionStore(context).register(session({ alias }))).alias, alias);
    });

    it('rejects a new session whose parent is not registered', async (context) => {
      await assert.rejects(
        sessionStore(context).register(session({ role: 'subagent', parentId: 'session-0' })),
        CONSTRAINT_FAILURE,
      );
    });

    it('rejects an alias of no character', async (context) => {
      await assert.rejects(sessionStore(context).register(session({ alias: '' })), CONSTRAINT_FAILURE);
    });

    it('rejects an alias of more than SESSION_ALIAS_MAX_LENGTH characters', async (context) => {
      const alias = 'a'.repeat(SESSION_ALIAS_MAX_LENGTH + 1);
      await assert.rejects(sessionStore(context).register(session({ alias })), CONSTRAINT_FAILURE);
    });

    it('rejects a negative context size', async (context) => {
      await assert.rejects(sessionStore(context).register(session({ contextTokens: -1 })), CONSTRAINT_FAILURE);
    });
  });

  describe('get', () => {
    it('returns the registered session', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await sessions.register(session({ id: 'session-2' }));
      assert.deepEqual(await sessions.get('session-2'), session({ id: 'session-2' }));
    });

    it('returns undefined for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).get('session-1'), undefined);
    });
  });

  describe('list', () => {
    it('returns no session from an empty store', async (context) => {
      assert.deepEqual(await sessionStore(context).list(), []);
    });

    it('returns every registered session in the order of its start', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ id: 'session-1', startedAt: 20 }));
      await sessions.register(session({ id: 'session-2', startedAt: 10 }));
      await sessions.register(session({ id: 'session-3', startedAt: 30 }));
      assert.deepEqual(
        (await sessions.list()).map(({ id }) => id),
        ['session-2', 'session-1', 'session-3'],
      );
    });
  });

  describe('setTask', () => {
    it('sets the task of a session with no task, and returns true', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      assert.equal(await sessions.setTask('session-1', 3), true);
      assert.equal((await registered(sessions, 'session-1')).taskId, 3);
    });

    it('returns false and keeps the task of a session that works on a task already', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ taskId: 3 }));
      assert.equal(await sessions.setTask('session-1', 4), false);
      assert.equal((await registered(sessions, 'session-1')).taskId, 3);
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).setTask('session-1', 3), false);
    });
  });

  describe('moveTask', () => {
    it('moves the session to the task, clears its ticket, and returns true', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ taskId: 3, ticketId: 2 }));
      assert.equal(await sessions.moveTask('session-1', 4), true);
      const { taskId, ticketId } = await registered(sessions, 'session-1');
      assert.deepEqual({ taskId, ticketId }, { taskId: 4, ticketId: null });
    });

    it('moves a session that works on no task', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      assert.equal(await sessions.moveTask('session-1', 4), true);
      assert.equal((await registered(sessions, 'session-1')).taskId, 4);
    });

    it('returns false and keeps the ticket of a session that works on the task already', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ taskId: 3, ticketId: 2 }));
      assert.equal(await sessions.moveTask('session-1', 3), false);
      assert.equal((await registered(sessions, 'session-1')).ticketId, 2);
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).moveTask('session-1', 3), false);
    });
  });

  describe('setTicket', () => {
    it('sets the ticket of a session that works on a task, and returns true', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ taskId: 3 }));
      assert.equal(await sessions.setTicket('session-1', 2), true);
      assert.equal((await registered(sessions, 'session-1')).ticketId, 2);
    });

    it('returns false for a session that works on no task', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      assert.equal(await sessions.setTicket('session-1', 2), false);
      assert.equal((await registered(sessions, 'session-1')).ticketId, null);
    });

    it('returns false and keeps the ticket of a session that works on a ticket already', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ taskId: 3, ticketId: 1 }));
      assert.equal(await sessions.setTicket('session-1', 2), false);
      assert.equal((await registered(sessions, 'session-1')).ticketId, 1);
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).setTicket('session-1', 2), false);
    });
  });

  describe('setAlias', () => {
    it('sets the alias of the session, and returns true', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ alias: 'Planner' }));
      assert.equal(await sessions.setAlias('session-1', 'Worker'), true);
      assert.equal((await registered(sessions, 'session-1')).alias, 'Worker');
    });

    it('clears the alias of the session for null', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ alias: 'Planner' }));
      assert.equal(await sessions.setAlias('session-1', null), true);
      assert.equal((await registered(sessions, 'session-1')).alias, null);
    });

    it('returns false for a session that holds the alias already', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ alias: 'Planner' }));
      assert.equal(await sessions.setAlias('session-1', 'Planner'), false);
    });

    it('returns false for a session with no alias and null', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      assert.equal(await sessions.setAlias('session-1', null), false);
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).setAlias('session-1', 'Planner'), false);
    });

    it('rejects an alias of no character', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await assert.rejects(sessions.setAlias('session-1', ''), CONSTRAINT_FAILURE);
    });

    it('rejects an alias of more than SESSION_ALIAS_MAX_LENGTH characters', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await assert.rejects(
        sessions.setAlias('session-1', 'a'.repeat(SESSION_ALIAS_MAX_LENGTH + 1)),
        CONSTRAINT_FAILURE,
      );
    });
  });

  describe('setUsage', () => {
    it('sets the context size, the model and the effort of the session, and returns true', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      assert.equal(
        await sessions.setUsage('session-1', { contextTokens: 1_200, model: 'claude-opus-5-5', effort: 'xhigh' }),
        true,
      );
      const { contextTokens, model, effort } = await registered(sessions, 'session-1');
      assert.deepEqual(
        { contextTokens, model, effort },
        { contextTokens: 1_200, model: 'claude-opus-5-5', effort: 'xhigh' },
      );
    });

    it('returns true when only one of the three changes', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ contextTokens: 1_200, model: 'claude-opus-5-5', effort: 'xhigh' }));
      assert.equal(
        await sessions.setUsage('session-1', { contextTokens: 1_200, model: 'claude-opus-5-5', effort: null }),
        true,
      );
      assert.equal((await registered(sessions, 'session-1')).effort, null);
    });

    it('returns false for a session that holds all three already', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session({ contextTokens: 1_200, model: 'claude-opus-5-5', effort: null }));
      assert.equal(
        await sessions.setUsage('session-1', { contextTokens: 1_200, model: 'claude-opus-5-5', effort: null }),
        false,
      );
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(
        await sessionStore(context).setUsage('session-1', { contextTokens: 1_200, model: null, effort: null }),
        false,
      );
    });

    it('rejects a negative context size', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await assert.rejects(
        sessions.setUsage('session-1', { contextTokens: -1, model: null, effort: null }),
        CONSTRAINT_FAILURE,
      );
    });
  });

  describe('delete', () => {
    it('deletes the session with its messages, and returns true', async (context) => {
      const { sessions, messageLog } = storage(context);
      await sessions.register(session());
      await sessions.register(session({ id: 'session-2' }));
      for (const sessionId of ['session-1', 'session-2'])
        await messageLog.append({ sessionId, messageId: null, sender: 'user', content: 'Hello', timestamp: 6 });
      assert.equal(await sessions.delete('session-1'), true);
      assert.equal(await sessions.get('session-1'), undefined);
      assert.deepEqual(
        (await messageLog.list({ sessionId: undefined, alias: undefined, after: undefined, limit: 10 })).map(
          ({ sessionId }) => sessionId,
        ),
        ['session-2'],
      );
    });

    it('returns false for a session that is not registered', async (context) => {
      assert.equal(await sessionStore(context).delete('session-1'), false);
    });

    it('rejects for a session that another session runs inside, and keeps it', async (context) => {
      const sessions = sessionStore(context);
      await sessions.register(session());
      await sessions.register(session({ id: 'session-2', role: 'subagent', parentId: 'session-1' }));
      await assert.rejects(sessions.delete('session-1'), CONSTRAINT_FAILURE);
      assert.deepEqual(await sessions.get('session-1'), session());
    });
  });
});
