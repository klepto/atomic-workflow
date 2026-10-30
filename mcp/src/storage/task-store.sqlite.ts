import type { DatabaseSync } from 'node:sqlite';
import { immediateTransaction } from './immediate-transaction.sqlite.ts';
import type {
  Goal,
  GoalText,
  NewGoal,
  NewTicket,
  Task,
  TaskStore,
  TaskSummary,
  Ticket,
  TicketProgress,
} from './task-store.ts';

/**
 * SQL list of the statuses of a completed ticket, whose work landed on the task branch.
 */
const COMPLETED = "('needs-review', 'done')";

/**
 * SQL list of the columns that come first in a task and in a task summary, each named as its field.
 */
const TASK_COLUMNS = 'id, slug, status, created_at AS createdAt';

/**
 * SQL list of the columns of the latest run of a task, each named as its field.
 */
const RUN_COLUMNS = 'run_started_at AS runStartedAt, run_ended_at AS runEndedAt';

/**
 * Goals of the tasks, in the table `goal`.
 */
interface GoalRows {
  /**
   * Returns the goals of the task `taskId`, in the order of their identifiers.
   */
  list(taskId: number): readonly Goal[];

  /**
   * Adds `goal` to the end of the goals of the task `taskId`, with the next identifier.
   * If no such task exists, throws.
   */
  add(taskId: number, goal: NewGoal): void;

  /**
   * Replaces the text of the goal `goalId` of the task `taskId` with `text`, and returns `true`. If the task has no
   * such goal, returns `false` instead.
   */
  edit(taskId: number, goalId: number, text: GoalText): boolean;

  /**
   * Deletes the goal `goalId` of the task `taskId`, moves each later goal of the task down by one identifier, and
   * returns `true`. If the task has no such goal, returns `false` instead. Runs in the transaction of its caller.
   */
  delete(taskId: number, goalId: number): boolean;

  /**
   * Deletes every goal of the task `taskId`.
   */
  deleteAll(taskId: number): void;
}

/**
 * Tickets of the tasks, in the table `ticket`, with the dependencies between them in the table `ticket_dependency`.
 */
interface TicketRows {
  /**
   * Returns the tickets of the task `taskId`, in the order of their identifiers.
   */
  list(taskId: number): readonly Ticket[];

  /**
   * Replaces the tickets of the task `taskId` with `tickets`, as `TaskStore.setTickets` says. Runs in the transaction
   * of its caller.
   * If a ticket breaks a check or a foreign key of its table, throws.
   */
  set(taskId: number, tickets: readonly NewTicket[]): void;

  /**
   * Sets the progress of the ticket `ticketId` of the task `taskId` to `progress`, and returns `true`. If the task has
   * no such ticket, returns `false` instead.
   * If `progress` breaks a check of the table, throws.
   */
  setProgress(taskId: number, ticketId: number, progress: TicketProgress): boolean;

  /**
   * Deletes every ticket of the task `taskId` with its dependencies. Runs in the transaction of its caller.
   */
  deleteAll(taskId: number): void;
}

/**
 * Methods of a `TaskStore` on the latest run of each task, in the columns `run_started_at` and `run_ended_at` of the
 * table `task`.
 */
type RunRows = Pick<TaskStore, 'startRun' | 'endRun' | 'endRuns'>;

/**
 * Returns `row`, a row that a statement selected, as a plain object of the type `T`. The tables are strict and check
 * the status, the source, the mode and the complexity, so each row that a statement selects with the columns of `T`
 * has the shape of `T`.
 */
const plain = <T>(row: Record<string, unknown>): T => ({ ...row }) as T;

/**
 * Returns the `GoalRows` that keep the goals in the table `goal` of `database`.
 */
const sqliteGoalRows = (database: DatabaseSync): GoalRows => {
  const insert = database.prepare(
    `INSERT INTO goal (task_id, id, summary, details, source)
    VALUES (:taskId, (SELECT COALESCE(MAX(id), 0) + 1 FROM goal WHERE task_id = :taskId), :summary, :details, :source)`,
  );
  const select = database.prepare('SELECT id, summary, details, source FROM goal WHERE task_id = :taskId ORDER BY id');
  const update = database.prepare(
    'UPDATE goal SET summary = :summary, details = :details WHERE id = :goalId AND task_id = :taskId',
  );
  const remove = database.prepare('DELETE FROM goal WHERE id = :goalId AND task_id = :taskId');
  // SQLite checks the primary key row by row, so the later goals move down in two updates: out of the way to negative
  // identifiers first, then back to one less than they had.
  const negateLater = database.prepare('UPDATE goal SET id = -id WHERE task_id = :taskId AND id > :goalId');
  const lowerNegated = database.prepare('UPDATE goal SET id = -id - 1 WHERE task_id = :taskId AND id < 0');
  const removeAll = database.prepare('DELETE FROM goal WHERE task_id = :taskId');
  return {
    list: (taskId) => select.all({ taskId }).map((row) => plain<Goal>(row)),
    add: (taskId, { summary, details, source }) => {
      insert.run({ taskId, summary, details, source });
    },
    edit: (taskId, goalId, { summary, details }) => update.run({ taskId, goalId, summary, details }).changes > 0,
    delete: (taskId, goalId) => {
      const deleted = remove.run({ taskId, goalId }).changes > 0;
      if (deleted) {
        negateLater.run({ taskId, goalId });
        lowerNegated.run({ taskId });
      }
      return deleted;
    },
    deleteAll: (taskId) => {
      removeAll.run({ taskId });
    },
  };
};

/**
 * Returns the `TicketRows` that keep the tickets in the table `ticket` of `database`, and the dependencies between
 * them in the table `ticket_dependency`.
 */
const sqliteTicketRows = (database: DatabaseSync): TicketRows => {
  // A ticket that replaces a stored one with its identifier keeps the progress of the stored one.
  const upsert = database.prepare(
    `INSERT INTO ticket (task_id, id, mode, type, complexity, slug, summary, description, fixes)
    VALUES (:taskId, :id, :mode, :type, :complexity, :slug, :summary, :description, :fixes)
    ON CONFLICT (task_id, id) DO UPDATE SET mode = excluded.mode, type = excluded.type,
      complexity = excluded.complexity, slug = excluded.slug, summary = excluded.summary,
      description = excluded.description, fixes = excluded.fixes`,
  );
  const insertDependency = database.prepare(
    'INSERT INTO ticket_dependency (task_id, ticket_id, depends_on_id) VALUES (:taskId, :ticketId, :dependsOnId)',
  );
  // The dependencies of each ticket come back as a JSON array, so one query selects the tickets with them.
  const select = database.prepare(
    `SELECT id, mode, type, complexity, slug, summary, description, fixes, status, stage,
      blocked_reason AS blockedReason,
      (SELECT json_group_array(depends_on_id) FROM (
        SELECT depends_on_id FROM ticket_dependency
        WHERE task_id = ticket.task_id AND ticket_id = ticket.id ORDER BY depends_on_id
      )) AS dependsOn
    FROM ticket WHERE task_id = :taskId ORDER BY id`,
  );
  const removeDependencies = database.prepare('DELETE FROM ticket_dependency WHERE task_id = :taskId');
  const removeAll = database.prepare('DELETE FROM ticket WHERE task_id = :taskId');
  const removeLater = database.prepare('DELETE FROM ticket WHERE task_id = :taskId AND id > :count');
  const updateProgress = database.prepare(
    `UPDATE ticket SET status = :status, stage = :stage, blocked_reason = :blockedReason
    WHERE task_id = :taskId AND id = :ticketId`,
  );
  return {
    list: (taskId) =>
      select.all({ taskId }).map((row) => plain<Ticket>({ ...row, dependsOn: JSON.parse(String(row.dependsOn)) })),
    set: (taskId, tickets) => {
      removeDependencies.run({ taskId });
      removeLater.run({ taskId, count: tickets.length });
      tickets.forEach(({ mode, type, complexity, slug, summary, description, fixes }, index) => {
        upsert.run({ taskId, id: index + 1, mode, type, complexity, slug, summary, description, fixes });
      });
      tickets.forEach(({ dependsOn }, index) => {
        for (const dependsOnId of dependsOn) insertDependency.run({ taskId, ticketId: index + 1, dependsOnId });
      });
    },
    setProgress: (taskId, ticketId, { status, stage, blockedReason }) =>
      updateProgress.run({ taskId, ticketId, status, stage, blockedReason }).changes > 0,
    deleteAll: (taskId) => {
      removeDependencies.run({ taskId });
      removeAll.run({ taskId });
    },
  };
};

/**
 * Returns the `RunRows` that keep the latest run of each task in the table `task` of `database`.
 */
const sqliteRunRows = (database: DatabaseSync): RunRows => {
  const updateStart = database.prepare('UPDATE task SET run_started_at = :at, run_ended_at = NULL WHERE id = :taskId');
  const updateEnd = database.prepare(
    `UPDATE task SET run_ended_at = :at
    WHERE id = :taskId AND run_started_at IS NOT NULL AND run_ended_at IS NULL
      AND (:startedAt IS NULL OR run_started_at = :startedAt)`,
  );
  const updateEnds = database.prepare(
    'UPDATE task SET run_ended_at = :at WHERE run_started_at IS NOT NULL AND run_ended_at IS NULL',
  );
  return {
    startRun: async (taskId, at) => updateStart.run({ taskId, at }).changes > 0,
    endRun: async (taskId, at, startedAt) => updateEnd.run({ taskId, at, startedAt: startedAt ?? null }).changes > 0,
    endRuns: async (at) => Number(updateEnds.run({ at }).changes),
  };
};

/**
 * Returns the `TaskStore` that keeps the tasks in the table `task` of `database`, their goals in the table `goal`, and
 * their tickets in the table `ticket`, with the dependencies between tickets in the table `ticket_dependency`.
 */
export const sqliteTaskStore = (database: DatabaseSync): TaskStore => {
  const goals = sqliteGoalRows(database);
  const tickets = sqliteTicketRows(database);
  const insert = database.prepare(
    "INSERT INTO task (slug, status, created_at) VALUES (:slug, 'plan-goals', :createdAt) RETURNING id",
  );
  const select = database.prepare(
    `SELECT ${TASK_COLUMNS}, design, base_branch AS baseBranch, ${RUN_COLUMNS} FROM task WHERE id = :id`,
  );
  const selectAll = database.prepare(
    `SELECT ${TASK_COLUMNS},
      (SELECT COUNT(*) FROM ticket WHERE task_id = task.id AND status IN ${COMPLETED}) AS completedTickets,
      (SELECT COUNT(*) FROM ticket WHERE task_id = task.id) AS totalTickets,
      ${RUN_COLUMNS}
    FROM task ORDER BY id`,
  );
  const remove = database.prepare('DELETE FROM task WHERE id = :taskId');
  const updateDesign = database.prepare('UPDATE task SET design = :design WHERE id = :taskId');
  const updateStatus = database.prepare('UPDATE task SET status = :status WHERE id = :taskId');
  const updateBaseBranch = database.prepare('UPDATE task SET base_branch = :branch WHERE id = :taskId');
  const get = (id: number): Task | undefined => {
    const row = select.get({ id });
    if (row === undefined) return undefined;
    return plain<Task>({ ...row, goals: goals.list(id), tickets: tickets.list(id) });
  };
  return {
    create: async ({ slug, createdAt, goal }) => {
      const id = immediateTransaction(database, () => {
        const taskId = Number(insert.get({ slug, createdAt })?.id);
        goals.add(taskId, goal);
        return taskId;
      });
      return get(id) as Task;
    },
    get: async (id) => get(id),
    list: async () => selectAll.all().map((row) => plain<TaskSummary>(row)),
    delete: async (id) =>
      immediateTransaction(database, () => {
        tickets.deleteAll(id);
        goals.deleteAll(id);
        return remove.run({ taskId: id }).changes > 0;
      }),
    addGoal: async (taskId, goal) => goals.add(taskId, goal),
    editGoal: async (taskId, goalId, text) => goals.edit(taskId, goalId, text),
    deleteGoal: async (taskId, goalId) => immediateTransaction(database, () => goals.delete(taskId, goalId)),
    setDesign: async (taskId, design) => updateDesign.run({ taskId, design }).changes > 0,
    setTickets: async (taskId, list) => immediateTransaction(database, () => tickets.set(taskId, list)),
    setStatus: async (taskId, status) => updateStatus.run({ taskId, status }).changes > 0,
    setBaseBranch: async (taskId, branch) => updateBaseBranch.run({ taskId, branch }).changes > 0,
    setTicketProgress: async (taskId, ticketId, progress) => tickets.setProgress(taskId, ticketId, progress),
    ...sqliteRunRows(database),
  };
};
