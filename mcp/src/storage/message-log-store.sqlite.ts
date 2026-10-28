import type { DatabaseSync } from 'node:sqlite';
import type { LoggedMessage, MessageLogStore } from './message-log-store.ts';

/**
 * Columns of a logged message, named as its fields.
 */
const COLUMNS = 'id, session_id AS sessionId, message_id AS messageId, sender, content, timestamp';

/**
 * Returns the `MessageLogStore` that keeps the message log in the table `message_log` of `database`, and reads the
 * role of a session from the table `session`. The table is strict and checks the sender, so each row that it selects
 * has the shape of a logged message.
 */
export const sqliteMessageLogStore = (database: DatabaseSync): MessageLogStore => {
  const insert = database.prepare(
    `INSERT INTO message_log (session_id, message_id, sender, content, timestamp)
    VALUES (:sessionId, :messageId, :sender, :content, :timestamp)
    ON CONFLICT (session_id, message_id) DO NOTHING
    RETURNING ${COLUMNS}`,
  );
  const selectMessageId = database.prepare(
    `SELECT ${COLUMNS} FROM message_log WHERE session_id = :sessionId AND message_id = :messageId`,
  );
  // A filter that is `null` selects every message.
  const filter = `(:sessionId IS NULL OR session_id = :sessionId)
    AND (:role IS NULL OR session_id IN (SELECT id FROM session WHERE role = :role))`;
  const selectAfter = database.prepare(
    `SELECT ${COLUMNS} FROM message_log WHERE ${filter} AND id > :after ORDER BY id LIMIT :limit`,
  );
  const selectLatest = database.prepare(
    `SELECT * FROM (SELECT ${COLUMNS} FROM message_log WHERE ${filter} ORDER BY id DESC LIMIT :limit) ORDER BY id`,
  );
  const removeSession = database.prepare('DELETE FROM message_log WHERE session_id = :sessionId');
  return {
    append: async (message) => {
      // An insert that conflicts returns no row, and the message that it conflicts with is selected instead.
      const { sessionId, messageId } = message;
      const row = insert.get({ ...message }) ?? selectMessageId.get({ sessionId, messageId });
      return row as unknown as LoggedMessage;
    },
    list: async ({ sessionId = null, role = null, after, limit }) => {
      const rows =
        after === undefined
          ? selectLatest.all({ sessionId, role, limit })
          : selectAfter.all({ sessionId, role, after, limit });
      return rows as unknown as LoggedMessage[];
    },
    deleteSession: async (sessionId) => Number(removeSession.run({ sessionId }).changes),
  };
};
