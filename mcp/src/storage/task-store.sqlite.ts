import type { DatabaseSync } from 'node:sqlite';
import type { Goal, NewTicket, Task, TaskStore, TaskSummary, Ticket } from './task-store.ts';

/**
 * Returns the `TaskStore` that keeps the tasks in the table `task` of `database`, their goals in the table `goal`, and
 * their tickets in the table `ticket`, with the dependencies between tickets in the table `ticket_dependency`. The
 * tables are strict and check the status, the source, the mode and the complexity, so each row that it selects has
 * the shape of a task, a goal or a ticket.
 */
export const sqliteTaskStore = (database: DatabaseSync): TaskStore => {
  const insertTask = database.prepare(
    `INSERT INTO task (slug, status, created_at) VALUES (:slug, 'plan-goals', :createdAt) RETURNING id`,
  );
  const selectTask = database.prepare(
    `SELECT id, slug, status, created_at AS createdAt, design FROM task WHERE id = :id`,
  );
  // Tickets have no completion yet, so each ticket counts as not completed.
  const selectTasks = database.prepare(
    `SELECT id, slug, status, created_at AS createdAt, 0 AS completedTickets,
      (SELECT COUNT(*) FROM ticket WHERE task_id = task.id) AS uncompletedTickets
    FROM task ORDER BY id`,
  );
  const removeTaskGoals = database.prepare(`DELETE FROM goal WHERE task_id = :taskId`);
  const removeTask = database.prepare(`DELETE FROM task WHERE id = :taskId`);
  const insertGoal = database.prepare(
    `INSERT INTO goal (task_id, id, summary, details, source)
    VALUES (:taskId, (SELECT COALESCE(MAX(id), 0) + 1 FROM goal WHERE task_id = :taskId), :summary, :details, :source)`,
  );
  const selectGoals = database.prepare(
    `SELECT id, summary, details, source FROM goal WHERE task_id = :taskId ORDER BY id`,
  );
  const updateGoal = database.prepare(
    `UPDATE goal SET summary = :summary, details = :details WHERE id = :goalId AND task_id = :taskId`,
  );
  const removeGoal = database.prepare(`DELETE FROM goal WHERE id = :goalId AND task_id = :taskId`);
  // SQLite checks the primary key row by row, so the later goals move down in two updates: out of the way to negative
  // identifiers first, then back to one less than they had.
  const negateLaterGoals = database.prepare(`UPDATE goal SET id = -id WHERE task_id = :taskId AND id > :goalId`);
  const lowerNegatedGoals = database.prepare(`UPDATE goal SET id = -id - 1 WHERE task_id = :taskId AND id < 0`);
  const updateDesign = database.prepare(`UPDATE task SET design = :design WHERE id = :taskId`);
  const insertTicket = database.prepare(
    `INSERT INTO ticket (task_id, id, mode, complexity, slug, summary, description)
    VALUES (:taskId, :id, :mode, :complexity, :slug, :summary, :description)`,
  );
  const insertDependency = database.prepare(
    `INSERT INTO ticket_dependency (task_id, ticket_id, depends_on_id) VALUES (:taskId, :ticketId, :dependsOnId)`,
  );
  // The dependencies of each ticket come back as a JSON array, so one query selects the tickets with them.
  const selectTickets = database.prepare(
    `SELECT id, mode, complexity, slug, summary, description,
      (SELECT json_group_array(depends_on_id) FROM (
        SELECT depends_on_id FROM ticket_dependency
        WHERE task_id = ticket.task_id AND ticket_id = ticket.id ORDER BY depends_on_id
      )) AS dependsOn
    FROM ticket WHERE task_id = :taskId ORDER BY id`,
  );
  const removeDependencies = database.prepare(`DELETE FROM ticket_dependency WHERE task_id = :taskId`);
  const removeTickets = database.prepare(`DELETE FROM ticket WHERE task_id = :taskId`);
  const updateStatus = database.prepare(`UPDATE task SET status = :status WHERE id = :taskId`);
  const get = (id: number): Task | undefined => {
    const row = selectTask.get({ id }) as Omit<Task, 'goals' | 'tickets'> | undefined;
    if (row === undefined) return undefined;
    const goals = selectGoals.all({ taskId: id }) as unknown as Goal[];
    return { ...row, goals, tickets: getTickets(id) };
  };
  const getTickets = (taskId: number): Ticket[] =>
    selectTickets.all({ taskId }).map((row) => ({ ...row, dependsOn: JSON.parse(row.dependsOn as string) }) as Ticket);
  const insertTickets = (taskId: number, tickets: readonly NewTicket[]): void => {
    tickets.forEach(({ mode, complexity, slug, summary, description }, index) => {
      insertTicket.run({ taskId, id: index + 1, mode, complexity, slug, summary, description });
    });
    tickets.forEach(({ dependsOn }, index) => {
      for (const dependsOnId of dependsOn) insertDependency.run({ taskId, ticketId: index + 1, dependsOnId });
    });
  };
  return {
    create: async ({ slug, createdAt, goal }) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const { id } = insertTask.get({ slug, createdAt }) as { id: number };
        insertGoal.run({ taskId: id, ...goal });
        database.exec('COMMIT');
        return get(id) as Task;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    get: async (id) => get(id),
    list: async () => selectTasks.all() as unknown as TaskSummary[],
    delete: async (id) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        removeDependencies.run({ taskId: id });
        removeTickets.run({ taskId: id });
        removeTaskGoals.run({ taskId: id });
        const deleted = removeTask.run({ taskId: id }).changes > 0;
        database.exec('COMMIT');
        return deleted;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    addGoal: async (taskId, goal) => {
      insertGoal.run({ taskId, ...goal });
    },
    editGoal: async (taskId, goalId, { summary, details }) =>
      updateGoal.run({ taskId, goalId, summary, details }).changes > 0,
    deleteGoal: async (taskId, goalId) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        const deleted = removeGoal.run({ taskId, goalId }).changes > 0;
        if (deleted) {
          negateLaterGoals.run({ taskId, goalId });
          lowerNegatedGoals.run({ taskId });
        }
        database.exec('COMMIT');
        return deleted;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    setDesign: async (taskId, design) => {
      updateDesign.run({ taskId, design });
    },
    setTickets: async (taskId, tickets) => {
      database.exec('BEGIN IMMEDIATE');
      try {
        removeDependencies.run({ taskId });
        removeTickets.run({ taskId });
        insertTickets(taskId, tickets);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    setStatus: async (taskId, status) => {
      updateStatus.run({ taskId, status });
    },
  };
};
