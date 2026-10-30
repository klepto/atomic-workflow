/**
 * Returns whether `error` is the failure of a file operation on a path that does not exist, with the code `ENOENT`.
 */
export const isNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';
