import { DatabaseSync } from 'node:sqlite';
import { sqliteStorage } from '../storage/open-storage.sqlite.ts';
import type { Storage } from '../storage/open-storage.ts';

/**
 * Returns a new `Storage` on an in-memory SQLite database, with the schema of `MIGRATIONS` applied by the same code
 * as `sqliteOpenStorage`. Touches no file, so each call starts empty.
 */
export const testStorage = (): Storage =>
  sqliteStorage(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
