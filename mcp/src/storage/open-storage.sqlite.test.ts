import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, type TestContext } from 'node:test';
import { MIGRATIONS } from './migrations.sqlite.ts';
import { sqliteOpenStorage, sqliteStorage } from './open-storage.sqlite.ts';

/**
 * Returns the path of a database file in a directory that does not exist yet, below a new temporary directory that
 * `after` of `context` removes.
 */
const databaseFile = async (context: TestContext): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'atomic-workflow-storage-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  return join(root, 'storage', 'database.sqlite');
};

/**
 * Returns the value of the pragma `name` of the database file at `path`.
 */
const pragma = (path: string, name: string): unknown => {
  const database = new DatabaseSync(path);
  try {
    return database.prepare(`PRAGMA ${name}`).get()?.[name];
  } finally {
    database.close();
  }
};

/**
 * Sets the schema version of the database file at `path` to `version`.
 */
const setUserVersion = (path: string, version: number): void => {
  const database = new DatabaseSync(path);
  database.exec(`PRAGMA user_version = ${version}`);
  database.close();
};

describe('sqliteOpenStorage', () => {
  it('creates the directory of the database with a .gitignore that keeps every file out of git', async (context) => {
    const path = await databaseFile(context);
    (await sqliteOpenStorage(path)).close();
    assert.deepEqual((await readdir(join(path, '..'))).sort(), ['.gitignore', 'database.sqlite']);
    assert.equal(await readFile(join(path, '..', '.gitignore'), 'utf8'), '*\n');
  });

  it('writes the .gitignore again on each open', async (context) => {
    const path = await databaseFile(context);
    (await sqliteOpenStorage(path)).close();
    await writeFile(join(path, '..', '.gitignore'), 'edited\n');
    (await sqliteOpenStorage(path)).close();
    assert.equal(await readFile(join(path, '..', '.gitignore'), 'utf8'), '*\n');
  });

  it('opens the database in write-ahead log mode at the schema version of every migration', async (context) => {
    const path = await databaseFile(context);
    (await sqliteOpenStorage(path)).close();
    assert.equal(pragma(path, 'journal_mode'), 'wal');
    assert.equal(pragma(path, 'user_version'), MIGRATIONS.length);
  });

  it('keeps the data of the database between two opens', async (context) => {
    const path = await databaseFile(context);
    const first = await sqliteOpenStorage(path);
    await first.tasks.create({
      slug: 'cache-layer-redis',
      createdAt: 5,
      goal: { summary: 'Cache the reads', details: null, source: 'user' },
    });
    first.close();
    const second = await sqliteOpenStorage(path);
    assert.deepEqual(
      (await second.tasks.list()).map(({ slug }) => slug),
      ['cache-layer-redis'],
    );
    second.close();
  });

  it('rejects a database with a newer schema', async (context) => {
    const path = await databaseFile(context);
    (await sqliteOpenStorage(path)).close();
    setUserVersion(path, MIGRATIONS.length + 1);
    await assert.rejects(sqliteOpenStorage(path), {
      name: 'Error',
      message: `The database has schema version ${MIGRATIONS.length + 1}, newer than ${MIGRATIONS.length}`,
    });
  });
});

describe('sqliteStorage', () => {
  it('brings an empty database to the schema version of every migration', () => {
    const database = new DatabaseSync(':memory:');
    sqliteStorage(database);
    assert.equal(database.prepare('PRAGMA user_version').get()?.user_version, MIGRATIONS.length);
    database.close();
  });

  it('closes the database when the storage closes', () => {
    const database = new DatabaseSync(':memory:');
    sqliteStorage(database).close();
    assert.equal(database.isOpen, false);
  });

  it('throws for a database with a newer schema and leaves it open', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    assert.throws(() => sqliteStorage(database), {
      name: 'Error',
      message: `The database has schema version ${MIGRATIONS.length + 1}, newer than ${MIGRATIONS.length}`,
    });
    assert.equal(database.isOpen, true);
    database.close();
  });
});
