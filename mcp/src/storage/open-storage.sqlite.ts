import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { immediateTransaction } from './immediate-transaction.sqlite.ts';
import { sqliteMessageLogStore } from './message-log-store.sqlite.ts';
import { MIGRATIONS } from './migrations.sqlite.ts';
import type { OpenStorageFunction, Storage } from './open-storage.ts';
import { sqliteSessionStore } from './session-store.sqlite.ts';
import { sqliteTaskStore } from './task-store.sqlite.ts';

/**
 * Time in ms that a statement waits for a lock that another connection holds, such as the one of a second repository
 * server that starts at the same time.
 */
const BUSY_TIMEOUT = 5_000;

/**
 * Content of the `.gitignore` in the directory of the database file, which keeps every file in the directory, itself
 * included, out of git.
 */
const GITIGNORE = '*\n';

/**
 * `OpenStorageFunction` that keeps the storage in one SQLite database, in write-ahead log mode. The database file
 * and its companion files of the write-ahead log sit in one directory. Writes the `.gitignore` of the directory again
 * on each open, so an edit of it does not last.
 * If the directory or the `.gitignore` cannot be written, the database cannot be opened, or the database is newer
 * than `MIGRATIONS`, rejects.
 */
export const sqliteOpenStorage: OpenStorageFunction = async (path) => {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '.gitignore'), GITIGNORE);
  const database = new DatabaseSync(path, { timeout: BUSY_TIMEOUT, enableForeignKeyConstraints: true });
  try {
    database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    return sqliteStorage(database);
  } catch (error) {
    database.close();
    throw error;
  }
};

/**
 * Returns the `Storage` on the open SQLite database `database`, once it has run the steps of `MIGRATIONS` that it had
 * not run yet. Closing the storage closes `database`. On a failure, leaves `database` open.
 * If `database` has run more steps than `MIGRATIONS` holds, or if the steps leave a foreign key broken, throws.
 */
export const sqliteStorage = (database: DatabaseSync): Storage => {
  migrate(database);
  return {
    sessions: sqliteSessionStore(database),
    messageLog: sqliteMessageLogStore(database),
    tasks: sqliteTaskStore(database),
    close: () => database.close(),
  };
};

/**
 * Runs the steps of `MIGRATIONS` that `database` has not run yet, in one transaction, with foreign keys off.
 * If `database` has run more steps than `MIGRATIONS` holds, or if the steps leave a foreign key broken, throws.
 */
const migrate = (database: DatabaseSync): void => {
  // A step can rebuild a table that another table references, which a foreign key check would block. The pragma has
  // no effect inside a transaction, so it wraps the transaction.
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    runMigrations(database);
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
};

/**
 * Runs the steps of `MIGRATIONS` that `database` has not run yet, in one transaction.
 * If `database` has run more steps than `MIGRATIONS` holds, or if the steps leave a foreign key broken, throws.
 */
const runMigrations = (database: DatabaseSync): void =>
  // An immediate transaction takes the write lock before it reads the version, so two servers never run one step twice.
  immediateTransaction(database, () => {
    const version = userVersion(database);
    if (version > MIGRATIONS.length)
      throw new Error(`The database has schema version ${version}, newer than ${MIGRATIONS.length}`);
    for (const step of MIGRATIONS.slice(version)) database.exec(step);
    if (database.prepare('PRAGMA foreign_key_check').get() !== undefined)
      throw new Error('The steps of the schema leave a foreign key broken');
    database.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
  });

/**
 * Returns the number of steps of the schema that `database` has run.
 */
const userVersion = (database: DatabaseSync): number => {
  const row = database.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
};
