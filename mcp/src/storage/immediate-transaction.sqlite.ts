import type { DatabaseSync } from 'node:sqlite';

/**
 * Runs `work` in an immediate transaction of `database`, which takes the write lock at its start, and returns the
 * result of `work` once the transaction commits. If `work` or the commit throws, rolls the transaction back and throws
 * the error again. If the rollback throws too, such as when SQLite has rolled the transaction back by itself, throws
 * the error of the rollback instead.
 */
export const immediateTransaction = <T>(database: DatabaseSync, work: () => T): T => {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};
