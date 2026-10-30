/**
 * Returns the code of the error `error`: a string such as `ENOENT` for an error of Node.js, or a number for the exit
 * code of a child process that ended with an error. If `error` has no code, returns `undefined` instead.
 */
export const errorCode = (error: unknown): string | number | undefined => {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  return typeof error.code === 'string' || typeof error.code === 'number' ? error.code : undefined;
};

/**
 * Returns the message of the error `error`, or `error` as a string when it is no `Error`.
 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
