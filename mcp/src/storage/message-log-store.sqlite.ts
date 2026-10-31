import type { DatabaseSync } from 'node:sqlite';
import type { LoggedMessage, MessageLogStore } from './message-log-store.ts';

/**
 * Columns of a logged message, named as its fields.
 */
const COLUMNS = 'id, session_id AS sessionId, message_id AS messageId, sender, content, timestamp';

/**
 * SQL statement that deletes every message of the session `:sessionId` from the table `message_log`. The session
 * store runs it too, since it deletes the messages of a session with the session.
 */
export const DELETE_SESSION_MESSAGES = 'DELETE FROM message_log WHERE session_id = :sessionId';

/**
 * Time of the latest message of a session, as `selectLatestTimes` selects it.
 */
interface LatestTime {
  /**
   * Identifier of the session.
   */
  readonly sessionId: string;

  /**
   * Time of the latest message of the session, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Returns the logged message of `row`, a row of `COLUMNS`, as a plain object. The table is strict and checks the
 * sender, so each row has the shape of a logged message.
 */
const loggedMessage = (row: Record<string, unknown>): LoggedMessage => ({ ...row }) as unknown as LoggedMessage;

/**
 * Returns the `MessageLogStore` that keeps the message log in the table `message_log` of `database`, and reads the
 * alias of a session from the table `session`.
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
    AND (:alias IS NULL OR session_id IN (SELECT id FROM session WHERE alias = :alias))`;
  const selectAfter = database.prepare(
    `SELECT ${COLUMNS} FROM message_log WHERE ${filter} AND id > :after ORDER BY id LIMIT :limit`,
  );
  const selectLatest = database.prepare(
    `SELECT * FROM (SELECT ${COLUMNS} FROM message_log WHERE ${filter} ORDER BY id DESC LIMIT :limit) ORDER BY id`,
  );
  const removeSession = database.prepare(DELETE_SESSION_MESSAGES);
  const selectLatestTimes = database.prepare(
    'SELECT session_id AS sessionId, MAX(timestamp) AS timestamp FROM message_log GROUP BY session_id',
  );
  return {
    append: async ({ sessionId, messageId, sender, content, timestamp }) => {
      // An insert that conflicts returns no row, and the message that it conflicts with is selected instead.
      const row =
        insert.get({ sessionId, messageId, sender, content, timestamp }) ??
        selectMessageId.get({ sessionId, messageId });
      return loggedMessage(row ?? {});
    },
    list: async ({ sessionId = null, alias = null, after, limit }) => {
      const rows =
        after === undefined
          ? selectLatest.all({ sessionId, alias, limit })
          : selectAfter.all({ sessionId, alias, after, limit });
      return rows.map(loggedMessage);
    },
    deleteSession: async (sessionId) => Number(removeSession.run({ sessionId }).changes),
    latestTimes: async () => {
      const rows = selectLatestTimes.all() as unknown as LatestTime[];
      return new Map(rows.map(({ sessionId, timestamp }) => [sessionId, timestamp]));
    },
  };
};
