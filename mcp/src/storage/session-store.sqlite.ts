import type { DatabaseSync } from 'node:sqlite';
import type { RegisteredSession, SessionStore } from './session-store.ts';

/**
 * Returns the `SessionStore` that keeps the sessions in the table `session` of `database`.
 */
export const sqliteSessionStore = (database: DatabaseSync): SessionStore => {
  const insert = database.prepare(
    `INSERT INTO session (id, agent, directory, started_at) VALUES (:id, :agent, :directory, :startedAt)
    ON CONFLICT (id) DO NOTHING`,
  );
  const select = database.prepare('SELECT id, agent, directory, started_at AS startedAt FROM session WHERE id = :id');
  // The table is strict and checks the agent, so each row has the shape of a registered session.
  const get = (id: string): RegisteredSession | undefined => select.get({ id }) as RegisteredSession | undefined;
  return {
    register: async (session) => {
      insert.run({ ...session });
      return get(session.id) ?? session;
    },
    get: async (id) => get(id),
  };
};
