/**
 * Steps of the schema, in order. The database records in `user_version` how many of them it has run, so a step never
 * changes once released: a change to the schema is a new step at the end.
 */
export const MIGRATIONS: readonly string[] = [
  // Step 1 creates the table `session` and the table `message_log`, with an index on the messages of each session.
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
  // Step 2 adds the role of a session, and the orchestrator session that a subagent runs inside.
  `ALTER TABLE session ADD COLUMN role TEXT NOT NULL DEFAULT 'orchestrator'
    CHECK (role IN ('orchestrator', 'subagent'));
  ALTER TABLE session ADD COLUMN parent_id TEXT REFERENCES session (id);`,
  // Step 3 creates the table `task` and the table `goal`, with an index on the goals of each task.
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
  // Step 4 rebuilds the table `task`, since SQLite cannot change the check of a column. It renames the phase
  // `decisions` to `design`, and adds the design of a task.
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
  // Step 5 rebuilds the table `task` to turn its phase into a status: `done` becomes `complete`, and each other phase
  // `plan-<phase>`. It creates the table `ticket` and the table `ticket_dependency`, and rebuilds the table `goal`, so
  // that the goals of each task have the identifiers 1 to n.
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
  // Step 6 rebuilds the table `ticket` to add the mode of a ticket. Each ticket stored before is `unattended`, and
  // only a `manual` ticket has no complexity.
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
  // Step 7 adds the base branch of a task, and the type, the status, the stage and the blocked reason of a ticket.
  `ALTER TABLE task ADD COLUMN base_branch TEXT;
  ALTER TABLE ticket ADD COLUMN type TEXT NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'other'));
  ALTER TABLE ticket ADD COLUMN status TEXT NOT NULL DEFAULT 'not-started'
    CHECK (status IN ('not-started', 'in-progress', 'needs-review', 'blocked', 'done'));
  ALTER TABLE ticket ADD COLUMN stage TEXT CHECK (stage IN ('prototype', 'refactor', 'tests'));
  ALTER TABLE ticket ADD COLUMN blocked_reason TEXT;`,
  // Step 8 rebuilds the table `task` to add the status `done`. It keeps the sequence of identifiers in
  // `sqlite_sequence`, so a new task never gets the identifier of a deleted one.
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
  // Step 14 adds the size of the context of a session in tokens. Each session stored before has none.
  `ALTER TABLE session ADD COLUMN context_tokens INTEGER CHECK (context_tokens IS NULL OR context_tokens >= 0);`,
  // Step 15 adds the model and the reasoning effort of the newest model request of a session. Each session stored
  // before has neither.
  `ALTER TABLE session ADD COLUMN model TEXT;
  ALTER TABLE session ADD COLUMN effort TEXT;`,
  // Step 16 adds the start and the end of the latest run of a task. Each task stored before never ran.
  `ALTER TABLE task ADD COLUMN run_started_at INTEGER;
  ALTER TABLE task ADD COLUMN run_ended_at INTEGER;`,
];
