import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { readDraft, writeDraft } from '@/review/draft-store.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';

/**
 * Function that changes the review: it takes a function from the current review to the next one.
 */
export type UpdateDraftFunction = (change: (draft: ReviewDraft) => ReviewDraft) => void;

/**
 * Review of one ticket, with the ticket that it belongs to.
 */
interface TicketDraft {
  /**
   * Identifier of the task of the ticket.
   */
  readonly taskId: number;

  /**
   * Identifier of the ticket within its task.
   */
  readonly ticketId: number;

  /**
   * Review of the ticket.
   */
  readonly draft: ReviewDraft;
}

/**
 * Returns the review of the ticket `ticketId` of the task `taskId`, kept in the browser store so that it outlives a
 * reload, with the function that changes it. The function stores the next review, and an empty review leaves the
 * store.
 */
export const useReviewDraft = (taskId: number, ticketId: number): [ReviewDraft, UpdateDraftFunction] => {
  const [state, setState] = useState<TicketDraft>(() => ({ taskId, ticketId, draft: readDraft(taskId, ticketId) }));
  const current =
    state.taskId === taskId && state.ticketId === ticketId
      ? state
      : { taskId, ticketId, draft: readDraft(taskId, ticketId) };
  if (current !== state) setState(current);
  const latest = useRef(current);
  useLayoutEffect(() => {
    latest.current = current;
  });
  const update = useCallback<UpdateDraftFunction>((change) => {
    // The store is written here, not in an updater of the state, which React may run twice.
    const next = { ...latest.current, draft: change(latest.current.draft) };
    latest.current = next;
    writeDraft(next.taskId, next.ticketId, next.draft);
    setState(next);
  }, []);
  return [current.draft, update];
};
