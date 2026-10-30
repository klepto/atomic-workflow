import { access, open, readdir, readFile } from 'node:fs/promises';
import { isNotFound } from './is-not-found.ts';
import type { TranscriptFiles } from './transcript-files.ts';

/**
 * `TranscriptFiles` that reads the files on disk.
 */
export const diskTranscriptFiles: TranscriptFiles = {
  readText: async (path) => readFile(path, 'utf8').catch((error: unknown) => ifNotFound(error, undefined)),
  readStart: async (path, length) => {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, 0);
      return buffer.toString('utf8', 0, bytesRead);
    } finally {
      await file.close();
    }
  },
  exists: async (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
  listNames: async (directory) => readdir(directory).catch((error: unknown) => ifNotFound(error, [])),
  listDirectories: async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => ifNotFound(error, []));
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  },
};

/**
 * Returns `fallback` when `error` is the failure of a file operation on a path that does not exist. Otherwise throws
 * `error` again.
 */
const ifNotFound = <T>(error: unknown, fallback: T): T => {
  if (isNotFound(error)) return fallback;
  throw error;
};
