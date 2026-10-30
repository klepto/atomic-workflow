import { platformPaths, relativeInside } from './paths.ts';
import type { RunGitFunction } from './run-git.ts';

/**
 * Number of the failures that `CopyFailures` names.
 */
const NAMED_FAILURE_COUNT = 10;

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
 * Path of a checkout that could not be copied.
 */
export interface CopyFailure {
  /**
   * Path relative to the checkout, with forward slashes.
   */
  readonly path: string;

  /**
   * Code of the error, such as `EPERM`, or `UNKNOWN` when the error has none.
   */
  readonly code: string;
}

/**
 * Paths that a copy of the ignored files could not copy.
 */
export interface CopyFailures {
  /**
   * Number of the paths that could not be copied.
   */
  readonly count: number;

  /**
   * First 10 failures, in the order they happened.
   */
  readonly first: readonly CopyFailure[];
}

/**
 * Function that copies the ignored paths `paths` of the checkout `checkout`, relative to it and with forward slashes,
 * such as `node_modules` and `.env`, to the same relative path in the directory `destination`, and returns the paths
 * that failed. A directory is copied with its contents. The storage of the atomic workflow, `.agents/atomic-workflow/`,
 * is never copied, and a file of the destination is never overwritten. A path that fails does not stop the copy of the
 * other paths. If nothing failed, returns `undefined` instead. Never rejects: each failure is in its result.
 */
export type CopyIgnoredFunction = (
  checkout: string,
  destination: string,
  paths: readonly string[],
) => Promise<CopyFailures | undefined>;

/**
 * Adapters that `copyIgnoredFiles` uses.
 */
interface CopyIgnoredFilesDependencies {
  /**
   * Function that runs git, which lists the ignored files.
   */
  readonly runGit: RunGitFunction;

  /**
   * Function that copies the listed files.
   */
  readonly copyIgnored: CopyIgnoredFunction;
}

/**
 * Copies every file and directory that the repository ignores in the checkout `checkout` to the same relative path in
 * the directory `destination`, as `CopyIgnoredFunction` says, and returns the paths that failed. If nothing failed,
 * returns `undefined` instead. If the ignored files cannot be listed, returns one failure with the path `.` and the
 * code `GIT_FAILED`, and copies nothing. Never rejects.
 */
export const copyIgnoredFiles = async (
  checkout: string,
  destination: string,
  dependencies: CopyIgnoredFilesDependencies,
): Promise<CopyFailures | undefined> => {
  const paths = await listIgnored(checkout, dependencies.runGit);
  if (paths === undefined) return { count: 1, first: [{ path: '.', code: 'GIT_FAILED' }] };
  return dependencies.copyIgnored(checkout, destination, paths);
};

/**
 * Returns the failures `failures`, in the order they happened, with the first 10 of them named. If `failures` is
 * empty, returns `undefined` instead.
 */
export const copyFailuresOf = (failures: readonly CopyFailure[]): CopyFailures | undefined => {
  if (failures.length === 0) return undefined;
  return { count: failures.length, first: failures.slice(0, NAMED_FAILURE_COUNT) };
};

/**
 * Returns the failures of `first` and `second` together, with the first 10 of them named, or `null` when neither has
 * any.
 */
export const joinFailures = (
  first: CopyFailures | undefined,
  second: CopyFailures | undefined,
): CopyFailures | null => {
  if (first === undefined) return second ?? null;
  if (second === undefined) return first;
  return { count: first.count + second.count, first: [...first.first, ...second.first].slice(0, NAMED_FAILURE_COUNT) };
};

/**
 * Returns the target of the copy of a link from the checkout `checkout` to the directory `destination`, on the
 * platform `platform`. The text of the original target is `text`, which resolves to the absolute path `resolved`. A
 * relative text whose target lies inside the checkout stays, unless `absolute`, such as for a junction of Windows.
 * Every other target is absolute: the same place inside the destination for a target inside the checkout, else
 * `resolved` itself.
 */
export const copiedLinkTarget = (
  checkout: string,
  destination: string,
  text: string,
  resolved: string,
  absolute: boolean,
  platform: NodeJS.Platform,
): string => {
  const paths = platformPaths(platform);
  const inside = relativeInside(checkout, resolved, platform);
  if (!absolute && !paths.isAbsolute(text) && inside !== undefined) return text;
  return inside === undefined ? resolved : paths.join(destination, inside);
};

/**
 * Returns the ignored paths of `checkout`, relative to it and without a trailing `/`, as git run with `runGit` lists
 * them. If git fails, returns `undefined` instead.
 */
const listIgnored = async (checkout: string, runGit: RunGitFunction): Promise<string[] | undefined> => {
  let stdout: string;
  try {
    const output = await runGit(checkout, LIST_IGNORED);
    if (output.exitCode !== 0) return undefined;
    stdout = output.stdout;
  } catch {
    // A git that cannot start lists nothing, which the caller reports as one failure.
    return undefined;
  }
  return stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => entry.replace(/\/$/, ''));
};
