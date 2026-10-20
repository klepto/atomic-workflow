import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sqliteMessageLogStore } from './message-log-store.sqlite.ts';
import type { OpenStorageFunction } from './open-storage.ts';
import { sqliteSessionStore } from './session-store.sqlite.ts';

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
 * Steps of the schema, in order. The database records in `user_version` how many of them it has run, so a step never
 * changes once released: a change to the schema is a new step at the end.
 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE session (
    id TEXT PRIMARY KEY,
    agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex')),
    directory TEXT NOT NULL,
    started_at INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE message_log (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES session (id),
    message_id TEXT,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'agent')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    UNIQUE (session_id, message_id)
  ) STRICT;
  CREATE INDEX message_log_session ON message_log (session_id, id);`,
  `ALTER TABLE session ADD COLUMN role TEXT NOT NULL DEFAULT 'orchestrator'
    CHECK (role IN ('orchestrator', 'subagent'));
  ALTER TABLE session ADD COLUMN parent_id TEXT REFERENCES session (id);`,
];

/**
 * `OpenStorageFunction` that keeps the storage in one SQLite database, in write-ahead log mode. The database file
 * and its companion files of the write-ahead log sit in one directory.
 */
export const sqliteOpenStorage: OpenStorageFunction = async (path) => {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '.gitignore'), GITIGNORE);
  const database = new DatabaseSync(path, { timeout: BUSY_TIMEOUT, enableForeignKeyConstraints: true });
  try {
    database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    migrate(database);
    return {
      sessions: sqliteSessionStore(database),
      messageLog: sqliteMessageLogStore(database),
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
};

/**
 * Runs the steps of `MIGRATIONS` that `database` has not run yet, in one transaction.
 * If `database` has run more steps than `MIGRATIONS` holds, throws.
 */
const migrate = (database: DatabaseSync): void => {
  // An immediate transaction takes the write lock before it reads the version, so two servers never run one step twice.
  database.exec('BEGIN IMMEDIATE');
  try {
    const version = userVersion(database);
    if (version > MIGRATIONS.length)
      throw new Error(`The database has schema version ${version}, newer than ${MIGRATIONS.length}`);
    for (const step of MIGRATIONS.slice(version)) database.exec(step);
    database.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

/**
 * Returns the number of steps of the schema that `database` has run.
 */
const userVersion = (database: DatabaseSync): number => {
  const row = database.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
};
