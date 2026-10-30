import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { CreateStaticFilesFunction, StaticAnswer, StaticFile } from './static-files.ts';

/**
 * Content type of each extension of a file of the web app.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Content type of a file with an extension outside the list: a download, which a browser never runs.
 */
const DOWNLOAD_TYPE = 'application/octet-stream';

/**
 * Name of the page of the web app, which answers every path that names no file.
 */
const INDEX_NAME = 'index.html';

/**
 * Name of the directory of the web app whose files never change, because the name of each one has a hash of its
 * content.
 */
const ASSETS_NAME = 'assets';

/**
 * Cache rule of a file that never changes: every cache keeps it for one year without a check.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * Characters that no path of a file of the web app has: `\`, `:` and NUL. Without them a path names no drive letter,
 * no alternate data stream and no second kind of separator on Windows.
 */
const FORBIDDEN_CHARACTERS = /[\\:\0]/;

/**
 * Codes of a failed look at a path that mean nothing can exist there: no entry, a file in place of a directory, or a
 * name that the file system does not take.
 */
const NO_FILE_CODES: readonly (string | undefined)[] = ['ENOENT', 'ENOTDIR', 'ENAMETOOLONG', 'EINVAL'];

/**
 * `CreateStaticFilesFunction` that returns the `StaticFiles` of the directory of `options` on disk, which read the
 * files of the directory on each call of `find`, and reject as `StaticFiles.find` says.
 */
export const directoryCreateStaticFiles: CreateStaticFilesFunction = (options) => ({
  find: (path) => find(options.directory, path),
});

/**
 * Returns the answer to `path`, the path of a request as it was sent, among the files of `directory`, and rejects as
 * `StaticFiles.find` says.
 */
const find = async (directory: string, path: string): Promise<StaticAnswer> => {
  const decoded = decode(path);
  if (decoded === undefined) return refuse('The path has a broken percent code');
  if (!decoded.startsWith('/')) return refuse('The path does not start with a slash');
  if (FORBIDDEN_CHARACTERS.test(decoded)) return refuse('The path has a backslash, a colon or a NUL character');
  const names = namesOf(decoded);
  if (names === undefined) return refuse('The path leaves the web app');
  const file = await readStaticFile(directory, names);
  if (file !== undefined) return { kind: 'file', file };
  const index = await readStaticFile(directory, [INDEX_NAME]);
  return index === undefined ? { kind: 'missing' } : { kind: 'fallback', file: index };
};

/**
 * Returns `path` with its percent codes decoded once, or `undefined` when one of them is broken.
 */
const decode = (path: string): string | undefined => {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
};

/**
 * Returns the refusal of a path for the reason `message`.
 */
const refuse = (message: string): StaticAnswer => {
  return { kind: 'refused', message };
};

/**
 * Returns the names that lead from the directory of the web app to what `path` names, a decoded path without `\`.
 * Returns `undefined` when `path` leaves the directory at any point, also when it comes back into it.
 */
const namesOf = (path: string): string[] | undefined => {
  const names: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '..' && names.pop() === undefined) return undefined;
    if (segment !== '' && segment !== '.' && segment !== '..') names.push(segment);
  }
  return names;
};

/**
 * Returns the file that `names` lead to from `directory`, with the content type of its extension.
 * Returns `undefined` when they lead to no file, such as a directory or a path that nothing exists at.
 * If the look at the path or the read of the file fails, rejects.
 */
const readStaticFile = async (directory: string, names: readonly string[]): Promise<StaticFile | undefined> => {
  const target = join(directory, ...names);
  if (!(await isFile(target))) return undefined;
  const contentType = CONTENT_TYPES[extname(target).toLowerCase()] ?? DOWNLOAD_TYPE;
  return { content: await readFile(target), contentType, cacheControl: cacheControlOf(names) };
};

/**
 * Returns the cache rule of the file that `names` lead to: the page of the web app is checked on every use, a file
 * below `assets/` never changes, and every other file has no rule.
 */
const cacheControlOf = (names: readonly string[]): string | undefined => {
  if (names.length === 1 && names[0] === INDEX_NAME) return 'no-cache';
  return names.length > 1 && names[0] === ASSETS_NAME ? IMMUTABLE : undefined;
};

/**
 * Returns the code of the caught value `error`, such as `ENOENT`, or `undefined` when it has none.
 */
const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;

/**
 * Returns whether `target`, an absolute path, is a file. A failure other than a path that nothing can exist at is
 * thrown.
 */
const isFile = async (target: string): Promise<boolean> => {
  try {
    return (await stat(target)).isFile();
  } catch (error) {
    if (NO_FILE_CODES.includes(errorCode(error))) return false;
    throw error;
  }
};
