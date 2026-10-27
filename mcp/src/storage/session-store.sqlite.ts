import type { DatabaseSync } from 'node:sqlite';
import type { RegisteredSession, SessionStore } from './session-store.ts';

/**
 * Returns the `SessionStore` that keeps the sessions in the table `session` of `database`.
 */
export const sqliteSessionStore = (database: DatabaseSync): SessionStore => {
  const insert = database.prepare(
    `INSERT INTO session (id, agent, directory, started_at, role, parent_id, task_id)
    VALUES (:id, :agent, :directory, :startedAt, :role, :parentId, :taskId)
    ON CONFLICT (id) DO NOTHING`,
  );
  const select = database.prepare(
    `SELECT id, agent, directory, started_at AS startedAt, role, parent_id AS parentId, task_id AS taskId FROM session
    WHERE id = :id`,
  );
  const selectAll = database.prepare(
    `SELECT id, agent, directory, started_at AS startedAt, role, parent_id AS parentId, task_id AS taskId FROM session
    ORDER BY started_at, id`,
  );
  const updateTask = database.prepare('UPDATE session SET task_id = :taskId WHERE id = :id AND task_id IS NULL');
  // The table is strict and checks the agent and the role, so each row has the shape of a registered session.
  const get = (id: string): RegisteredSession | undefined => select.get({ id }) as RegisteredSession | undefined;
  return {
    register: async (session) => {
      insert.run({ ...session });
      return get(session.id) ?? session;
    },
    get: async (id) => get(id),
    list: async () => selectAll.all() as unknown as RegisteredSession[],
    setTask: async (id, taskId) => updateTask.run({ id, taskId }).changes > 0,
  };
};
