import type { MessageLogStore } from './message-log-store.ts';
import { sqliteOpenStorage } from './open-storage.sqlite.ts';
import type { SessionStore } from './session-store.ts';
import type { TaskStore } from './task-store.ts';

/**
 * Open persistent storage of a repository, with one store per kind of data.
 */
export interface Storage {
  /**
   * Store of the sessions.
   */
  readonly sessions: SessionStore;

  /**
   * Store of the message log.
   */
  readonly messageLog: MessageLogStore;

  /**
   * Store of the tasks.
   */
  readonly tasks: TaskStore;

  /**
   * Closes the storage. No store works after.
   */
  close(): void;
}

/**
 * Function that opens the storage in the database file at `path`, and returns it once it is ready. Creates the file
 * and its directory when they do not exist, and brings the schema of an older database up to date. The directory of
 * the file holds a `.gitignore` that keeps every file in it out of git.
 * If the database is newer than this version of the storage, rejects.
 */
export type OpenStorageFunction = (path: string) => Promise<Storage>;

/**
 * Default `OpenStorageFunction`, which keeps the storage in SQLite.
 */
export const OpenStorage: OpenStorageFunction = sqliteOpenStorage;
