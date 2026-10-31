import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { NewTask } from '../storage/task-store.ts';
import { testStorage } from './test-storage.ts';

/**
 * Task to create in the tests, with the slug `cache-layer-redis`.
 */
const NEW_TASK: NewTask = {
  slug: 'cache-layer-redis',
  createdAt: 5,
  goal: { summary: 'Cache the reads', details: null, source: 'user' },
};

describe('testStorage', () => {
  it('starts with no task and no session', async () => {
    const storage = testStorage();
    assert.deepEqual(await storage.tasks.list(), []);
    assert.deepEqual(await storage.sessions.list(), []);
    storage.close();
  });

  it('stores a task in the schema of every migration', async () => {
    const storage = testStorage();
    const task = await storage.tasks.create(NEW_TASK);
    assert.deepEqual(
      (await storage.tasks.list()).map(({ id, slug }) => ({ id, slug })),
      [{ id: task.id, slug: 'cache-layer-redis' }],
    );
    storage.close();
  });

  it('keeps the data of each storage apart', async () => {
    const first = testStorage();
    const second = testStorage();
    await first.tasks.create(NEW_TASK);
    assert.deepEqual(await second.tasks.list(), []);
    first.close();
    second.close();
  });

  it('creates no file in the working directory', async () => {
    const before = await readdir('.');
    testStorage().close();
    assert.deepEqual(await readdir('.'), before);
  });
});
