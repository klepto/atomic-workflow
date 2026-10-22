import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readlink, stat, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { CopyFailure, CopyIgnoredFunction } from './copy-ignored.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Path of the storage of the atomic workflow relative to the checkout, which is never copied.
 */
const STORAGE_PATH = '.agents/atomic-workflow';

/**
 * Command line of git that lists every ignored file of a checkout, and every wholly ignored directory as one entry
 * that ends in `/`, each entry ended by a NUL.
 */
const LIST_IGNORED: readonly string[] = [
  'ls-files',
  '-z',
  '--others',
  '--ignored',
  '--exclude-standard',
  '--directory',
];

/**
 * Number of the file operations that run at once.
 */
const OPERATION_LIMIT = 16;

/**
 * Number of the failures that `CopyFailures` names.
 */
const NAMED_FAILURE_COUNT = 10;

/**
 * Flags of the copy of a file: a clone where the file system supports it, and never over an existing file.
 */
const COPY_FLAGS = constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL;

/**
 * Runs a file operation once fewer than `OPERATION_LIMIT` others run, and returns its value.
 */
type Limit = <Value>(operation: () => Promise<Value>) => Promise<Value>;

/**
 * One copy of the ignored files of a checkout, with the failures that it collects as it goes.
 */
interface CopyRun {
  /**
   * Absolute path of the checkout that the files come from.
   */
  readonly checkout: string;

  /**
   * Absolute path of the directory that the files go to.
   */
  readonly destination: string;

  /**
   * Limit that every file operation of the copy runs through.
   */
  readonly limit: Limit;

  /**
   * Failures of the copy, in the order they happened.
   */
  readonly failures: CopyFailure[];
}

/**
 * `CopyIgnoredFunction` that lists the ignored files with `git ls-files` and walks them on the disk. A link is
 * recreated, never followed, and a target inside the checkout becomes the same place inside the destination.
 */
export const diskCopyIgnored: CopyIgnoredFunction = async (checkout, destination) => {
  const entries = await listIgnored(checkout);
  if (entries === undefined) return { count: 1, first: [{ path: '.', code: 'GIT_FAILED' }] };
  const run: CopyRun = {
    checkout: resolve(checkout),
    destination: resolve(destination),
    limit: createLimit(OPERATION_LIMIT),
    failures: [],
  };
  await Promise.all(entries.map((entry) => copyEntry(run, entry)));
  if (run.failures.length === 0) return undefined;
  return { count: run.failures.length, first: run.failures.slice(0, NAMED_FAILURE_COUNT) };
};

/**
 * Returns the ignored paths of `checkout`, relative to it and without a trailing `/`. If git fails, returns
 * `undefined` instead.
 */
const listIgnored = async (checkout: string): Promise<string[] | undefined> => {
  try {
    const { stdout } = await execFileAsync('git', LIST_IGNORED, {
      cwd: checkout,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout
      .split('\0')
      .filter((entry) => entry !== '')
      .map((entry) => entry.replace(/\/$/, ''));
  } catch {
    return undefined;
  }
};

/**
 * Returns a `Limit` that lets at most `size` operations run at once, and starts the waiting ones in the order they
 * came.
 */
const createLimit = (size: number): Limit => {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (operation) => {
    // A finished operation hands its place to the next waiting one, so `running` only drops when none waits.
    if (running < size) running += 1;
    else await new Promise<void>((resume) => waiting.push(resume));
    try {
      return await operation();
    } finally {
      const next = waiting.shift();
      if (next === undefined) running -= 1;
      else next();
    }
  };
};

/**
 * Copies the listed entry `path` of `run`, after the directory that holds it exists in the destination.
 */
const copyEntry = async (run: CopyRun, path: string): Promise<void> => {
  if (isStorage(path)) return;
  if (!(await makeDirectory(run, path, dirname(join(run.destination, path))))) return;
  await copyPath(run, path);
};

/**
 * Returns whether `path`, relative to the checkout, is the storage of the atomic workflow or lies below it.
 */
const isStorage = (path: string): boolean => path === STORAGE_PATH || path.startsWith(`${STORAGE_PATH}/`);

/**
 * Makes the directory `directory` with every missing parent for the path `path` of `run`, and returns whether it
 * exists now. A failure is recorded for `path`.
 */
const makeDirectory = async (run: CopyRun, path: string, directory: string): Promise<boolean> => {
  const made = await attempt(run, path, async () => {
    await mkdir(directory, { recursive: true });
    return true;
  });
  return made === true;
};

/**
 * Returns the value of the file operation `operation` on `path` of `run`, run through the limit of `run`. If the
 * operation fails, records the failure of `path` and returns `undefined` instead. A failure with a code of
 * `ignoredCodes` is no failure, and also returns `undefined`.
 */
const attempt = async <Value>(
  run: CopyRun,
  path: string,
  operation: () => Promise<Value>,
  ignoredCodes: readonly string[] = [],
): Promise<Value | undefined> => {
  try {
    return await run.limit(operation);
  } catch (error) {
    const code = codeOf(error);
    if (!ignoredCodes.includes(code)) run.failures.push({ path, code });
    return undefined;
  }
};

/**
 * Returns the code of the Node.js error `error`, or `UNKNOWN` when it has none.
 */
const codeOf = (error: unknown): string => {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code;
  return 'UNKNOWN';
};

/**
 * Copies the file, directory or link `path` of `run`. Anything else, such as a socket, is not copied.
 */
const copyPath = async (run: CopyRun, path: string): Promise<void> => {
  if (isStorage(path)) return;
  const source = join(run.checkout, path);
  const target = join(run.destination, path);
  const stats = await attempt(run, path, () => lstat(source));
  if (stats === undefined) return;
  if (stats.isSymbolicLink()) await copyLink(run, path, source, target);
  else if (stats.isDirectory()) await copyDirectory(run, path, source, target);
  else if (stats.isFile()) await attempt(run, path, () => copyFile(source, target, COPY_FLAGS), ['EEXIST']);
};

/**
 * Makes the directory `target` for the directory `path` of `run` at `source`, then copies each path it holds. If the
 * directory cannot be made or read, its contents are not copied.
 */
const copyDirectory = async (run: CopyRun, path: string, source: string, target: string): Promise<void> => {
  if (!(await makeDirectory(run, path, target))) return;
  const names = await attempt(run, path, () => readdir(source));
  if (names === undefined) return;
  await Promise.all(names.map((name) => copyPath(run, `${path}/${name}`)));
};

/**
 * Recreates the link `path` of `run` at `source` as the link `target`, with its target moved into the destination
 * when it lies inside the checkout. An existing `target` stays unchanged.
 */
const copyLink = async (run: CopyRun, path: string, source: string, target: string): Promise<void> => {
  const text = await attempt(run, path, () => readlink(source));
  if (text === undefined) return;
  const resolved = resolve(dirname(source), text);
  const inside = insideCheckout(run, resolved);
  const junction = process.platform === 'win32' && (await isDirectoryOrMissing(run, resolved));
  const linkTarget = junction ? absoluteTarget(run, resolved, inside) : linkText(run, text, resolved, inside);
  const type = junction ? 'junction' : 'file';
  await attempt(run, path, () => symlink(linkTarget, target, type), ['EEXIST']);
};

/**
 * Returns the path of `resolved` relative to the checkout of `run`, or `undefined` when it lies outside the checkout.
 */
const insideCheckout = (run: CopyRun, resolved: string): string | undefined => {
  const path = relative(run.checkout, resolved);
  if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) return undefined;
  return path;
};

/**
 * Returns whether the target `resolved` of a link is a directory or does not exist. A target that cannot be read
 * counts as one that does not exist.
 */
const isDirectoryOrMissing = async (run: CopyRun, resolved: string): Promise<boolean> => {
  try {
    return (await run.limit(() => stat(resolved))).isDirectory();
  } catch {
    return true;
  }
};

/**
 * Returns the absolute target of a link to `resolved`: the same place inside the destination of `run` when `inside`,
 * its path relative to the checkout, is given, else `resolved` itself.
 */
const absoluteTarget = (run: CopyRun, resolved: string, inside: string | undefined): string =>
  inside === undefined ? resolved : join(run.destination, inside);

/**
 * Returns the target of a recreated link whose original target is the text `text`, which resolves to `resolved`. A
 * relative text that stays inside the checkout of `run` is kept. Every other target is absolute.
 */
const linkText = (run: CopyRun, text: string, resolved: string, inside: string | undefined): string => {
  if (!isAbsolute(text) && inside !== undefined) return text;
  return absoluteTarget(run, resolved, inside);
};
