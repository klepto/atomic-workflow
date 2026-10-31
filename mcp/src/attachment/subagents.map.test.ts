import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testConnection } from '../testing/test-connection.ts';
import { mapCreateSubagents } from './subagents.map.ts';

/**
 * Signal that never aborts.
 */
const NEVER = new AbortController().signal;

/**
 * Returns `settled` when `promise` has settled by the time the promises that are due now ran, else `pending`.
 */
const stateOf = async (promise: Promise<unknown>): Promise<'settled' | 'pending'> =>
  Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    Promise.resolve('pending' as const),
  ]);

describe('mapCreateSubagents', () => {
  describe('start', () => {
    it('starts a subagent that is listed once it attaches', () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      assert.deepEqual(subagents.list(), []);
      subagents.attach('subagent-1');
      assert.deepEqual(subagents.list(), [{ sessionId: 'subagent-1', parentId: 'parent-1' }]);
    });

    it('removes the subagent once its connection closes', async () => {
      const subagents = mapCreateSubagents();
      const connection = testConnection();
      subagents.start('subagent-1', 'parent-1', connection);
      subagents.attach('subagent-1');
      connection.close();
      await connection.closed;
      assert.deepEqual(subagents.list(), []);
    });

    it('replaces a started subagent, whose wait settles only when its signal aborts', async () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      const abort = new AbortController();
      const wait = subagents.waitForAttach('subagent-1', abort.signal);
      subagents.start('subagent-1', 'parent-2', testConnection());
      subagents.attach('subagent-1');
      assert.equal(await stateOf(wait), 'pending');
      assert.deepEqual(subagents.list(), [{ sessionId: 'subagent-1', parentId: 'parent-2' }]);
      abort.abort(new Error('The wait was aborted'));
      await assert.rejects(wait, { message: 'The wait was aborted' });
    });
  });

  describe('waitForAttach', () => {
    it('resolves once the subagent attaches', async () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      const wait = subagents.waitForAttach('subagent-1', NEVER);
      subagents.attach('subagent-1');
      assert.equal(await wait, undefined);
    });

    it('rejects for a subagent that is not started', async () => {
      await assert.rejects(mapCreateSubagents().waitForAttach('subagent-1', NEVER), Error);
    });

    it('rejects when the subagent is stopped before it attaches', async () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      const wait = subagents.waitForAttach('subagent-1', NEVER);
      subagents.stop('subagent-1');
      await assert.rejects(wait, Error);
    });

    it('rejects when the connection closes before the subagent attaches', async () => {
      const subagents = mapCreateSubagents();
      const connection = testConnection();
      subagents.start('subagent-1', 'parent-1', connection);
      const wait = subagents.waitForAttach('subagent-1', NEVER);
      connection.close();
      await assert.rejects(wait, Error);
    });

    it('rejects with the reason of the signal when it aborts first', async () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      const abort = new AbortController();
      const wait = subagents.waitForAttach('subagent-1', abort.signal);
      abort.abort(new Error('The wait was aborted'));
      await assert.rejects(wait, { message: 'The wait was aborted' });
    });
  });

  describe('attach', () => {
    it('keeps an attached subagent attached', () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      subagents.attach('subagent-1');
      subagents.attach('subagent-1');
      assert.deepEqual(subagents.list(), [{ sessionId: 'subagent-1', parentId: 'parent-1' }]);
    });

    it('leaves a session that is no started subagent as it is', () => {
      const subagents = mapCreateSubagents();
      subagents.attach('subagent-1');
      assert.deepEqual(subagents.list(), []);
    });
  });

  describe('stop', () => {
    it('removes the subagent and returns true', () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      subagents.attach('subagent-1');
      assert.equal(subagents.stop('subagent-1'), true);
      assert.deepEqual(subagents.list(), []);
    });

    it('returns false for a subagent that is not started', () => {
      assert.equal(mapCreateSubagents().stop('subagent-1'), false);
    });
  });

  describe('list', () => {
    it('lists the attached subagents in the order of their start', () => {
      const subagents = mapCreateSubagents();
      subagents.start('subagent-1', 'parent-1', testConnection());
      subagents.start('subagent-2', 'parent-1', testConnection());
      subagents.start('subagent-3', 'parent-2', testConnection());
      subagents.attach('subagent-3');
      subagents.attach('subagent-1');
      assert.deepEqual(subagents.list(), [
        { sessionId: 'subagent-1', parentId: 'parent-1' },
        { sessionId: 'subagent-3', parentId: 'parent-2' },
      ]);
    });
  });
});
