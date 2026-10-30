import { access, mkdir, readFile, rm } from 'node:fs/promises';
import type { FileSystem } from './file-system.ts';

/**
 * Number of the retries of the deletion of a directory that another program holds.
 */
const REMOVAL_RETRY_COUNT = 10;

/**
 * Time between two retries of the deletion of a directory, in ms.
 */
const REMOVAL_RETRY_INTERVAL = 200;

/**
 * `FileSystem` on the disk, through the file system of Node.js.
 */
export const diskFileSystem: FileSystem = {
  exists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      // A path that cannot be reached counts as one that does not exist.
      return false;
    }
  },
  readText: async (path) => readFile(path, 'utf8'),
  makeDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  removeDirectory: async (path) =>
    rm(path, { recursive: true, force: true, maxRetries: REMOVAL_RETRY_COUNT, retryDelay: REMOVAL_RETRY_INTERVAL }),
};
