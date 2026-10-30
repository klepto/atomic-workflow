import { useEffect, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { TicketCommit } from '@/api/types.ts';
import { errorMessage } from '@/lib/error-message.ts';
import { type FileDiff, parsePatch } from '@/review/patch.ts';

/**
 * Changes of a ticket as the review reads them: while they load, once the read failed, once no commit holds them,
 * and once they loaded, with the commit and its files.
 */
export type Changes =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'none' }
  | { readonly state: 'loaded'; readonly commit: string; readonly files: readonly FileDiff[] };

/**
 * Returns the changes of the ticket `ticketId` of the task `taskId`, read once its work landed, as `landed` says, and
 * again whenever one of them changes. While its work has not landed, they are `none`. A failed read gives the state
 * `failed` with the message of the failure.
 */
export const useChanges = (taskId: number, ticketId: number, landed: boolean): Changes => {
  const [changes, setChanges] = useState<Changes>({ state: 'loading' });
  useEffect(() => {
    if (!landed) {
      setChanges({ state: 'none' });
      return;
    }
    let current = true;
    setChanges({ state: 'loading' });
    fetchCall<TicketCommit | null>('ticketDiff', { taskId, ticketId }).then(
      (found) => {
        if (!current) return;
        setChanges(found === null ? { state: 'none' } : { state: 'loaded', ...found, files: parsePatch(found.patch) });
      },
      (error: unknown) => {
        if (current) setChanges({ state: 'failed', message: errorMessage(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [taskId, ticketId, landed]);
  return changes;
};
