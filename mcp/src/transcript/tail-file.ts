import { pollTailFile } from './tail-file.poll.ts';

/**
 * Function that follows the text file at `path` from its start, and passes each complete line that it holds or that
 * is appended to it later to `handle`, in order and without the line break. It waits for `handle` before it reads
 * on, and resolves when `signal` aborts, after one last read that passes the lines appended before the abort. A file
 * that does not exist yet is followed once it does, and a file that shrinks is followed from its start again.
 * If the file cannot be read, or `handle` rejects, rejects.
 */
export type TailFileFunction = (
  path: string,
  handle: (lines: readonly string[]) => Promise<void>,
  signal: AbortSignal,
) => Promise<void>;

/**
 * Default `TailFileFunction`, which checks the size of the file at a fixed interval.
 */
export const TailFile: TailFileFunction = pollTailFile;
