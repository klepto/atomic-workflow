import { useCallback, useEffect, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { ChangedFile, TicketChanges, TicketFilePatch } from '@/api/types.ts';
import { errorMessage } from '@/lib/error-message.ts';
import { hasLongLine } from '@/review/long-line.ts';
import { type FileDiff, parsePatch } from '@/review/patch.ts';

/**
 * Lines of a changed file as the review reads them: while they load, once their load failed, and once they loaded,
 * with whether a line is longer than `LONG_LINE_LENGTH`.
 */
export type FileLines =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'loaded'; readonly diff: FileDiff; readonly longLines: boolean };

/**
 * Changed file of the review: its summary from `ticketDiff`, and its lines.
 */
export interface ReviewFile {
  /**
   * Summary of the file, with its path, its status and its line counts.
   */
  readonly summary: ChangedFile;

  /**
   * Lines of the file.
   */
  readonly lines: FileLines;
}

/**
 * Changes of a ticket as the review reads them: while they load, once the read failed, once no commit holds them,
 * and once they loaded, with the commit and its files.
 */
export type Changes =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'none' }
  | { readonly state: 'loaded'; readonly commit: string; readonly files: readonly ReviewFile[] };

/**
 * Function that loads the lines of the file `path` again, after their load failed, once the files queued before it
 * loaded. It stays the same for the life of the component.
 */
export type RetryFunction = (path: string) => void;

/**
 * Returns the lines of the file whose section of the patch is `patch`. A section that holds no file fails.
 */
const linesOfPatch = (patch: string): FileLines => {
  const diff = parsePatch(patch)[0];
  if (diff === undefined) return { state: 'failed', message: 'The patch of the file holds no changes' };
  return { state: 'loaded', diff, longLines: hasLongLine(diff) };
};

/**
 * Returns the changed file `summary` of the review, with its lines from its patch, or loading for a big file.
 */
const reviewFileOf = (summary: ChangedFile): ReviewFile => ({
  summary,
  lines: summary.patch === null ? { state: 'loading' } : linesOfPatch(summary.patch),
});

/**
 * Returns the paths of the big files of `files`, in the order that they load: the files that are not generated first,
 * then the generated ones, each in their order.
 */
const loadOrderOf = (files: readonly ChangedFile[]): readonly string[] => {
  const big = files.filter((file) => file.patch === null);
  return [...big.filter((file) => !file.generated), ...big.filter((file) => file.generated)].map((file) => file.path);
};

/**
 * Returns `changes` with the lines of the file `path` replaced by `lines`.
 */
const withLines = (changes: Changes, path: string, lines: FileLines): Changes =>
  changes.state === 'loaded'
    ? { ...changes, files: changes.files.map((file) => (file.summary.path === path ? { ...file, lines } : file)) }
    : changes;

/**
 * Returns the changes of the ticket `ticketId` of the task `taskId`, read once its work landed, as `landed` says, and
 * again whenever one of them changes, with the function that loads the lines of a file again. While its work has not
 * landed, they are `none`. A failed read gives the state `failed` with the message of the failure. The lines of each
 * big file load after the changes, one file at a time, the files that are not generated first. A failed load of the
 * lines of a file gives that file the state `failed`, and the function loads it again.
 */
export const useChanges = (taskId: number, ticketId: number, landed: boolean): [Changes, RetryFunction] => {
  const [changes, setChanges] = useState<Changes>({ state: 'loading' });
  const [queue, setQueue] = useState<readonly string[]>([]);

  useEffect(() => {
    setQueue([]);
    if (!landed) {
      setChanges({ state: 'none' });
      return;
    }
    let current = true;
    setChanges({ state: 'loading' });
    fetchCall<TicketChanges | null>('ticketDiff', { taskId, ticketId }).then(
      (found) => {
        if (!current) return;
        if (found === null) {
          setChanges({ state: 'none' });
          return;
        }
        setChanges({ state: 'loaded', commit: found.commit, files: found.files.map(reviewFileOf) });
        setQueue(loadOrderOf(found.files));
      },
      (error: unknown) => {
        if (current) setChanges({ state: 'failed', message: errorMessage(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [taskId, ticketId, landed]);

  const commit = changes.state === 'loaded' ? changes.commit : undefined;
  const next = queue[0];

  useEffect(() => {
    if (commit === undefined || next === undefined) return;
    let current = true;

    /**
     * Gives the file `next` the lines `lines`, and takes it off the queue, so that the next file loads.
     */
    const settle = (lines: FileLines): void => {
      if (!current) return;
      setChanges((changes) => withLines(changes, next, lines));
      setQueue((queue) => (queue[0] === next ? queue.slice(1) : queue));
    };

    fetchCall<TicketFilePatch>('ticketFileDiff', { taskId, ticketId, commit, path: next }).then(
      ({ patch }) => settle(linesOfPatch(patch)),
      (error: unknown) => settle({ state: 'failed', message: errorMessage(error) }),
    );
    return () => {
      current = false;
    };
  }, [taskId, ticketId, commit, next]);

  const retry = useCallback((path: string): void => {
    setChanges((changes) => withLines(changes, path, { state: 'loading' }));
    setQueue((queue) => (queue.includes(path) ? queue : [...queue, path]));
  }, []);

  return [changes, retry];
};
