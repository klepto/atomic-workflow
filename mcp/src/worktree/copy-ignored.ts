import { diskCopyIgnored } from './copy-ignored.disk.ts';

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
 * Function that copies every file and directory that the repository ignores in the checkout `checkout` to the same
 * relative path in the directory `destination`, such as `node_modules` and `.env`, and returns the paths that failed.
 * The storage of the atomic workflow, `.agents/atomic-workflow/`, is never copied, and a file of the destination is
 * never overwritten. A path that fails does not stop the copy of the other paths. If nothing failed, returns
 * `undefined` instead. If the ignored files cannot be listed, returns one failure with the path `.` and the code
 * `GIT_FAILED`, and copies nothing.
 */
export type CopyIgnoredFunction = (checkout: string, destination: string) => Promise<CopyFailures | undefined>;

/**
 * Default `CopyIgnoredFunction`, which lists the ignored files with git, clones each file where the file system
 * supports it, and copies it elsewhere.
 */
export const CopyIgnored: CopyIgnoredFunction = diskCopyIgnored;
