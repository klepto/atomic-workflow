import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapCreateSessionActivity } from '../attachment/session-activity.map.ts';
import { mapCreateSessionConnections } from '../attachment/session-connections.map.ts';
import { mapCreateSubagents } from '../attachment/subagents.map.ts';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { NewTask } from '../storage/task-store.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testStorage } from '../testing/test-storage.ts';
import type { ChangedResource, ChangeFeed } from './change-feed.ts';
import { feedPublishChanges } from './publish-changes.feed.ts';

/**
 * `ChangeFeed` of a test, which records each resource that it is told, at once and in order.
 */
interface RecordingFeed extends ChangeFeed {
  /**
   * Resources that the feed was told, in order.
   */
  readonly published: readonly ChangedResource[];
}

/**
 * Wrapped services of a test, with the feed that they publish to.
 */
interface Published {
  /**
   * Feed that the services publish to.
   */
  readonly feed: RecordingFeed;

  /**
   * Services that publish to `feed`.
   */
  readonly services: ReturnType<typeof feedPublishChanges>;
}

/**
 * Task of the tests.
 */
const TASK: NewTask = { slug: 'cache-layer', createdAt: 0, goal: { summary: 'Cache', details: null, source: 'user' } };

/**
 * Returns a new `RecordingFeed`.
 */
const recordingFeed = (): RecordingFeed => {
  const published: ChangedResource[] = [];
  return {
    published,
    publish: (resource) => void published.push(resource),
    subscribe: () => () => undefined,
  };
};

/**
 * Returns the services of a new `testStorage` and new map adapters, wrapped by `feedPublishChanges` with a new
 * `RecordingFeed`.
 */
const published = (): Published => {
  const storage = testStorage();
  const feed = recordingFeed();
  const services = feedPublishChanges(
    {
      messageLog: storage.messageLog,
      tasks: storage.tasks,
      sessions: storage.sessions,
      sessionConnections: mapCreateSessionConnections(),
      subagents: mapCreateSubagents(),
      activity: mapCreateSessionActivity(),
    },
    feed,
  );
  return { feed, services };
};

/**
 * Returns a registered orchestrator session with the identifier `id`.
 */
const session = (id: string): RegisteredSession => ({
  id,
  agent: 'claude',
  directory: '/repository',
  startedAt: 0,
  role: 'orchestrator',
  parentId: null,
  taskId: null,
  job: null,
  ticketId: null,
  alias: null,
  contextTokens: null,
  model: null,
  effort: null,
});

describe('feedPublishChanges', () => {
  describe('messageLog', () => {
    it('publishes messages once append resolves', async () => {
      const { feed, services } = published();
      await services.sessions.register(session('session-1'));
      const appended = await services.messageLog.append({
        sessionId: 'session-1',
        messageId: null,
        sender: 'user',
        content: 'Hello',
        timestamp: 1,
      });
      assert.equal(appended.content, 'Hello');
      assert.deepEqual(feed.published, ['messages']);
    });

    it('publishes messages when deleteSession deletes a message, and nothing when it deletes none', async () => {
      const { feed, services } = published();
      await services.sessions.register(session('session-1'));
      await services.messageLog.append({
        sessionId: 'session-1',
        messageId: null,
        sender: 'user',
        content: 'Hello',
        timestamp: 1,
      });
      assert.equal(await services.messageLog.deleteSession('session-2'), 0);
      assert.equal(await services.messageLog.deleteSession('session-1'), 1);
      assert.deepEqual(feed.published, ['messages', 'messages']);
    });

    it('publishes nothing for a read', async () => {
      const { feed, services } = published();
      await services.messageLog.list({ sessionId: undefined, alias: undefined, after: undefined, limit: 10 });
      await services.messageLog.latestTimes();
      assert.deepEqual(feed.published, []);
    });
  });

  describe('tasks', () => {
    it('publishes tasks once a write resolves', async () => {
      const { feed, services } = published();
      const task = await services.tasks.create(TASK);
      await services.tasks.setDesign(task.id, 'Design');
      assert.equal((await services.tasks.get(task.id))?.design, 'Design');
      assert.deepEqual(feed.published, ['tasks', 'tasks']);
    });

    it('publishes tasks for startRun, endRun and endRuns only with a change', async () => {
      const { feed, services } = published();
      const task = await services.tasks.create(TASK);
      assert.equal(await services.tasks.startRun(task.id + 1, 10), false);
      assert.equal(await services.tasks.startRun(task.id, 10), true);
      assert.equal(await services.tasks.endRun(task.id + 1, 20), false);
      assert.equal(await services.tasks.endRuns(30), 1);
      assert.equal(await services.tasks.endRuns(40), 0);
      assert.deepEqual(feed.published, ['tasks', 'tasks', 'tasks']);
    });

    it('publishes nothing for a read', async () => {
      const { feed, services } = published();
      await services.tasks.get(1);
      await services.tasks.list();
      assert.deepEqual(feed.published, []);
    });

    it('publishes nothing for a write that rejects', async () => {
      const storage = testStorage();
      const feed = recordingFeed();
      const services = feedPublishChanges(
        {
          messageLog: storage.messageLog,
          tasks: {
            ...storage.tasks,
            create: async () => {
              throw new Error('The database is closed');
            },
          },
          sessions: storage.sessions,
          sessionConnections: mapCreateSessionConnections(),
          subagents: mapCreateSubagents(),
          activity: mapCreateSessionActivity(),
        },
        feed,
      );
      await assert.rejects(services.tasks.create(TASK), { message: 'The database is closed' });
      assert.deepEqual(feed.published, []);
    });
  });

  describe('sessions', () => {
    it('publishes sessions for a write that resolves with true, and nothing for one with false', async () => {
      const { feed, services } = published();
      await services.sessions.register(session('session-1'));
      assert.equal(await services.sessions.setAlias('session-2', 'other'), false);
      assert.equal(await services.sessions.setAlias('session-1', 'main'), true);
      assert.deepEqual(feed.published, ['sessions']);
    });

    it('publishes sessions and messages when delete deletes the session', async () => {
      const { feed, services } = published();
      await services.sessions.register(session('session-1'));
      assert.equal(await services.sessions.delete('session-2'), false);
      assert.equal(await services.sessions.delete('session-1'), true);
      assert.deepEqual(feed.published, ['sessions', 'messages']);
    });

    it('publishes nothing for register and for a read', async () => {
      const { feed, services } = published();
      await services.sessions.register(session('session-1'));
      await services.sessions.get('session-1');
      await services.sessions.list();
      assert.deepEqual(feed.published, []);
    });
  });

  describe('sessionConnections', () => {
    it('publishes sessions on bind, and again once the connection closes', async () => {
      const { feed, services } = published();
      const connection = testConnection();
      assert.equal(services.sessionConnections.bind('session-1', connection), undefined);
      assert.equal(services.sessionConnections.get('session-1'), connection);
      assert.deepEqual(feed.published, ['sessions']);
      connection.close();
      await connection.closed;
      assert.deepEqual(feed.published, ['sessions', 'sessions']);
      assert.deepEqual(services.sessionConnections.list(), []);
    });
  });

  describe('subagents', () => {
    it('publishes sessions on attach and on stop', () => {
      const { feed, services } = published();
      services.subagents.start('subagent-1', 'session-1', testConnection());
      assert.deepEqual(feed.published, []);
      services.subagents.attach('subagent-1');
      assert.deepEqual(services.subagents.list(), [{ sessionId: 'subagent-1', parentId: 'session-1' }]);
      assert.equal(services.subagents.stop('subagent-1'), true);
      assert.deepEqual(feed.published, ['sessions', 'sessions']);
    });

    it('publishes sessions once the connection of a started subagent closes', async () => {
      const { feed, services } = published();
      const connection = testConnection();
      services.subagents.start('subagent-1', 'session-1', connection);
      connection.close();
      await connection.closed;
      assert.deepEqual(feed.published, ['sessions']);
    });
  });

  describe('activity', () => {
    it('publishes sessions when a report changes the activity, and nothing when it does not', () => {
      const { feed, services } = published();
      assert.equal(services.activity.report('session-1', 'working', 10), true);
      assert.equal(services.activity.report('session-1', 'working', 20), false);
      assert.equal(services.activity.reportAction('session-1', 'Read: a.ts', 30), true);
      assert.equal(services.activity.forget('session-1'), true);
      assert.equal(services.activity.forget('session-1'), false);
      assert.equal(services.activity.get('session-1'), undefined);
      assert.deepEqual(feed.published, ['sessions', 'sessions', 'sessions']);
    });
  });
});
