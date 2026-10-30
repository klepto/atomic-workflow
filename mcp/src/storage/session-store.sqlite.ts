import type { DatabaseSync } from 'node:sqlite';
import { immediateTransaction } from './immediate-transaction.sqlite.ts';
import { DELETE_SESSION_MESSAGES } from './message-log-store.sqlite.ts';
import type { RegisteredSession, SessionStore } from './session-store.ts';

/**
 * Column of the table `session` that holds each field of a registered session, in the order of the columns.
 */
const COLUMNS = {
  id: 'id',
  agent: 'agent',
  directory: 'directory',
  startedAt: 'started_at',
  role: 'role',
  parentId: 'parent_id',
  taskId: 'task_id',
  job: 'job',
  ticketId: 'ticket_id',
  alias: 'alias',
  contextTokens: 'context_tokens',
  model: 'model',
  effort: 'effort',
} as const satisfies Record<keyof RegisteredSession, string>;

/**
 * Fields of a registered session, in the order of their columns.
 */
const FIELDS = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];

/**
 * SQL list of the columns of a registered session, in the order of `COLUMNS`.
 */
const INSERTED_COLUMNS = FIELDS.map((field) => COLUMNS[field]).join(', ');

/**
 * SQL list of the named parameters of a registered session, one per field, in the order of `COLUMNS`.
 */
const INSERTED_VALUES = FIELDS.map((field) => `:${field}`).join(', ');

/**
 * SQL list of the columns of a registered session, each named as its field.
 */
const SELECTED_COLUMNS = FIELDS.map((field) =>
  COLUMNS[field] === field ? field : `${COLUMNS[field]} AS ${field}`,
).join(', ');

/**
 * Returns the registered session of `row`, a row of `SELECTED_COLUMNS`, as a plain object. The table is strict and
 * checks the agent and the role, so each row has the shape of a registered session.
 */
const registeredSession = (row: Record<string, unknown>): RegisteredSession =>
  ({ ...row }) as unknown as RegisteredSession;

/**
 * Returns the `SessionStore` that keeps the sessions in the table `session` of `database`, and deletes the messages of
 * a deleted session from the table `message_log`.
 */
export const sqliteSessionStore = (database: DatabaseSync): SessionStore => {
  const insert = database.prepare(
    `INSERT INTO session (${INSERTED_COLUMNS}) VALUES (${INSERTED_VALUES}) ON CONFLICT (id) DO NOTHING`,
  );
  const select = database.prepare(`SELECT ${SELECTED_COLUMNS} FROM session WHERE id = :id`);
  const selectAll = database.prepare(`SELECT ${SELECTED_COLUMNS} FROM session ORDER BY started_at, id`);
  const updateTask = database.prepare('UPDATE session SET task_id = :taskId WHERE id = :id AND task_id IS NULL');
  const moveToTask = database.prepare(
    'UPDATE session SET task_id = :taskId, ticket_id = NULL WHERE id = :id AND task_id IS NOT :taskId',
  );
  const updateTicket = database.prepare(
    'UPDATE session SET ticket_id = :ticketId WHERE id = :id AND task_id IS NOT NULL AND ticket_id IS NULL',
  );
  const updateAlias = database.prepare('UPDATE session SET alias = :alias WHERE id = :id AND alias IS NOT :alias');
  const updateUsage = database.prepare(
    `UPDATE session SET context_tokens = :contextTokens, model = :model, effort = :effort
    WHERE id = :id AND (context_tokens IS NOT :contextTokens OR model IS NOT :model OR effort IS NOT :effort)`,
  );
  const removeMessages = database.prepare(DELETE_SESSION_MESSAGES);
  const remove = database.prepare('DELETE FROM session WHERE id = :id');
  const get = (id: string): RegisteredSession | undefined => {
    const row = select.get({ id });
    return row === undefined ? undefined : registeredSession(row);
  };
  return {
    register: async (session) => {
      insert.run(Object.fromEntries(FIELDS.map((field) => [field, session[field]])));
      return get(session.id) ?? session;
    },
    get: async (id) => get(id),
    list: async () => selectAll.all().map(registeredSession),
    setTask: async (id, taskId) => updateTask.run({ id, taskId }).changes > 0,
    moveTask: async (id, taskId) => moveToTask.run({ id, taskId }).changes > 0,
    setTicket: async (id, ticketId) => updateTicket.run({ id, ticketId }).changes > 0,
    setAlias: async (id, alias) => updateAlias.run({ id, alias }).changes > 0,
    setUsage: async (id, { contextTokens, model, effort }) =>
      updateUsage.run({ id, contextTokens, model, effort }).changes > 0,
    delete: async (id) =>
      immediateTransaction(database, () => {
        removeMessages.run({ sessionId: id });
        return remove.run({ id }).changes > 0;
      }),
  };
};
