/**
 * Options of a `TailFileFunction`.
 */
export interface TailFileOptions {
  /**
   * Byte of the file to start at, which must start a line, or 0 when it is left out.
   */
  readonly offset?: number;
}

/**
 * Function that follows the text file at `path` from its start, or from the byte `offset` of `options`, and passes each complete line that it holds or that
 * is appended to it later to `handle`, in order and without the line break. It waits for `handle` before it reads
 * on, and resolves when `signal` aborts, after one last read that passes the lines appended before the abort. A file
 * that does not exist yet is followed once it does, and a file that shrinks is followed from its start again. Rejects
 * when the file cannot be read for another cause than that it does not exist, or when `handle` rejects.
 */
export type TailFileFunction = (
  path: string,
  handle: (lines: readonly string[]) => Promise<void>,
  signal: AbortSignal,
  options?: TailFileOptions,
) => Promise<void>;
