import type { DatabaseSync } from 'node:sqlite';
import type { LoggedMessage, MessageLogStore } from './message-log-store.ts';

/**
 * Columns of a logged message, named as its fields.
 */
const COLUMNS = 'id, session_id AS sessionId, message_id AS messageId, sender, content, timestamp';

/**
 * Returns the `MessageLogStore` that keeps the message log in the table `message_log` of `database`. The table is
 * strict and checks the sender, so each row that it selects has the shape of a logged message.
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
  const selectAfter = database.prepare(`SELECT ${COLUMNS} FROM message_log WHERE id > :after ORDER BY id LIMIT :limit`);
  const selectSessionAfter = database.prepare(
    `SELECT ${COLUMNS} FROM message_log WHERE session_id = :sessionId AND id > :after ORDER BY id LIMIT :limit`,
  );
  const selectLatest = database.prepare(
    `SELECT * FROM (SELECT ${COLUMNS} FROM message_log ORDER BY id DESC LIMIT :limit) ORDER BY id`,
  );
  const selectSessionLatest = database.prepare(
    `SELECT * FROM (
      SELECT ${COLUMNS} FROM message_log WHERE session_id = :sessionId ORDER BY id DESC LIMIT :limit
    ) ORDER BY id`,
  );
  return {
    append: async (message) => {
      // An insert that conflicts returns no row, and the message that it conflicts with is selected instead.
      const { sessionId, messageId } = message;
      const row = insert.get({ ...message }) ?? selectMessageId.get({ sessionId, messageId });
      return row as unknown as LoggedMessage;
    },
    list: async ({ sessionId, after, limit }) => {
      if (after === undefined) {
        const rows =
          sessionId === undefined ? selectLatest.all({ limit }) : selectSessionLatest.all({ sessionId, limit });
        return rows as unknown as LoggedMessage[];
      }
      const rows =
        sessionId === undefined
          ? selectAfter.all({ after, limit })
          : selectSessionAfter.all({ sessionId, after, limit });
      return rows as unknown as LoggedMessage[];
    },
  };
};
