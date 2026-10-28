import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sqliteMessageLogStore } from './message-log-store.sqlite.ts';
import type { OpenStorageFunction } from './open-storage.ts';
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
  `CREATE TABLE task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('goals', 'decisions', 'tickets', 'done')),
    created_at INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE goal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES task (id),
    summary TEXT NOT NULL,
    details TEXT,
    source TEXT NOT NULL CHECK (source IN ('user', 'agent'))
  ) STRICT;
  CREATE INDEX goal_task ON goal (task_id, id);`,
  `CREATE TABLE task_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('goals', 'design', 'tickets', 'done')),
    created_at INTEGER NOT NULL,
    design TEXT
  ) STRICT;
  INSERT INTO task_new (id, slug, phase, created_at)
    SELECT id, slug, CASE phase WHEN 'decisions' THEN 'design' ELSE phase END, created_at FROM task;
  DROP TABLE task;
  ALTER TABLE task_new RENAME TO task;`,
  `CREATE TABLE task_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('plan-goals', 'plan-design', 'plan-tickets', 'complete')),
    created_at INTEGER NOT NULL,
    design TEXT
  ) STRICT;
  INSERT INTO task_new (id, slug, status, created_at, design)
    SELECT id, slug, CASE phase WHEN 'done' THEN 'complete' ELSE 'plan-' || phase END, created_at, design FROM task;
  DROP TABLE task;
  ALTER TABLE task_new RENAME TO task;
  CREATE TABLE ticket (
    task_id INTEGER NOT NULL REFERENCES task (id),
    id INTEGER NOT NULL,
    complexity TEXT NOT NULL CHECK (complexity IN ('simple', 'moderate', 'complex')),
    slug TEXT NOT NULL,
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    PRIMARY KEY (task_id, id)
  ) STRICT;
  CREATE TABLE ticket_dependency (
    task_id INTEGER NOT NULL,
    ticket_id INTEGER NOT NULL,
    depends_on_id INTEGER NOT NULL CHECK (depends_on_id < ticket_id),
    PRIMARY KEY (task_id, ticket_id, depends_on_id),
    FOREIGN KEY (task_id, ticket_id) REFERENCES ticket (task_id, id),
    FOREIGN KEY (task_id, depends_on_id) REFERENCES ticket (task_id, id)
  ) STRICT;
  CREATE TABLE goal_new (
    task_id INTEGER NOT NULL REFERENCES task (id),
    id INTEGER NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    source TEXT NOT NULL CHECK (source IN ('user', 'agent')),
    PRIMARY KEY (task_id, id)
  ) STRICT;
  INSERT INTO goal_new (task_id, id, summary, details, source)
    SELECT task_id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY id), summary, details, source FROM goal;
  DROP TABLE goal;
  ALTER TABLE goal_new RENAME TO goal;`,
  `CREATE TABLE ticket_new (
    task_id INTEGER NOT NULL REFERENCES task (id),
    id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('unattended', 'attended', 'manual')),
    complexity TEXT CHECK (complexity IN ('simple', 'moderate', 'complex')),
    slug TEXT NOT NULL,
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    PRIMARY KEY (task_id, id),
    CHECK ((mode = 'manual') = (complexity IS NULL))
  ) STRICT;
  INSERT INTO ticket_new (task_id, id, mode, complexity, slug, summary, description)
    SELECT task_id, id, 'unattended', complexity, slug, summary, description FROM ticket;
  DROP TABLE ticket;
  ALTER TABLE ticket_new RENAME TO ticket;`,
  `ALTER TABLE task ADD COLUMN base_branch TEXT;
  ALTER TABLE ticket ADD COLUMN type TEXT NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'other'));
  ALTER TABLE ticket ADD COLUMN status TEXT NOT NULL DEFAULT 'not-started'
    CHECK (status IN ('not-started', 'in-progress', 'needs-review', 'blocked', 'done'));
  ALTER TABLE ticket ADD COLUMN stage TEXT CHECK (stage IN ('prototype', 'refactor', 'tests'));
  ALTER TABLE ticket ADD COLUMN blocked_reason TEXT;`,
  `CREATE TABLE task_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('plan-goals', 'plan-design', 'plan-tickets', 'complete', 'done')),
    created_at INTEGER NOT NULL,
    design TEXT,
    base_branch TEXT
  ) STRICT;
  INSERT INTO task_new (id, slug, status, created_at, design, base_branch)
    SELECT id, slug, status, created_at, design, base_branch FROM task;
  DELETE FROM sqlite_sequence WHERE name = 'task_new';
  INSERT INTO sqlite_sequence (name, seq) SELECT 'task_new', seq FROM sqlite_sequence WHERE name = 'task';
  DROP TABLE task;
  ALTER TABLE task_new RENAME TO task;`,
  // Step 9 rebuilds the table `ticket`, since SQLite cannot change the check of a column. It turns each `moderate`
  // ticket into a `simple` one. The stage `refactor` now comes last, and only a `complex` ticket runs it, so a ticket
  // in it moves to the stage that now does its work: `tests` for a `complex` ticket, `prototype` for a `simple` one.
  `CREATE TABLE ticket_new (
    task_id INTEGER NOT NULL REFERENCES task (id),
    id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('unattended', 'attended', 'manual')),
    complexity TEXT CHECK (complexity IN ('simple', 'complex')),
    slug TEXT NOT NULL,
    summary TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'other')),
    status TEXT NOT NULL DEFAULT 'not-started'
      CHECK (status IN ('not-started', 'in-progress', 'needs-review', 'blocked', 'done')),
    stage TEXT CHECK (stage IN ('prototype', 'tests', 'refactor')),
    blocked_reason TEXT,
    PRIMARY KEY (task_id, id),
    CHECK ((mode = 'manual') = (complexity IS NULL))
  ) STRICT;
  INSERT INTO ticket_new
    (task_id, id, mode, complexity, slug, summary, description, type, status, stage, blocked_reason)
    SELECT task_id, id, mode, CASE complexity WHEN 'moderate' THEN 'simple' ELSE complexity END, slug, summary,
      description, type, status,
      CASE WHEN stage = 'refactor' AND complexity = 'complex' THEN 'tests'
        WHEN stage = 'refactor' THEN 'prototype' ELSE stage END,
      blocked_reason
    FROM ticket;
  DROP TABLE ticket;
  ALTER TABLE ticket_new RENAME TO ticket;`,
  // Step 10 adds the ticket that a ticket fixes. The ticket depends on it too, so the foreign key of its row in
  // `ticket_dependency` checks that it exists.
  `ALTER TABLE ticket ADD COLUMN fixes INTEGER CHECK (fixes < id);`,
  // Step 11 adds the task that a session works on. It has no foreign key, so a task with sessions can still be deleted.
  `ALTER TABLE session ADD COLUMN task_id INTEGER;`,
  // Step 12 adds the job of a subagent and the ticket that it works on, which name its chat. Neither has a foreign key,
  // so a task with sessions can still be deleted.
  `ALTER TABLE session ADD COLUMN job TEXT;
  ALTER TABLE session ADD COLUMN ticket_id INTEGER;`,
  // Step 13 adds the alias of a session, its display name. Each session stored before has none.
  `ALTER TABLE session ADD COLUMN alias TEXT CHECK (alias IS NULL OR length(alias) BETWEEN 1 AND 60);`,
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
      tasks: sqliteTaskStore(database),
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
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
const runMigrations = (database: DatabaseSync): void => {
  // An immediate transaction takes the write lock before it reads the version, so two servers never run one step twice.
  database.exec('BEGIN IMMEDIATE');
  try {
    const version = userVersion(database);
    if (version > MIGRATIONS.length)
      throw new Error(`The database has schema version ${version}, newer than ${MIGRATIONS.length}`);
    for (const step of MIGRATIONS.slice(version)) database.exec(step);
    if (database.prepare('PRAGMA foreign_key_check').get() !== undefined)
      throw new Error('The steps of the schema leave a foreign key broken');
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
