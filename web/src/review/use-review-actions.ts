import { useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { RequestedChanges, TaskSummary, Ticket } from '@/api/types.ts';
import { errorMessage } from '@/lib/error-message.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';
import { reviewMarkdown } from '@/review/review-markdown.ts';
import type { Changes } from '@/review/use-changes.ts';
import { navigate } from '@/routing/navigation.ts';
import { taskRefOf, ticketPath, ticketRefOf } from '@/routing/route.ts';
import { approveTicket } from '@/tasks/approve-ticket.ts';

/**
 * Action of the bar at the bottom of the review that runs: the approval of the ticket, or the request of changes.
 */
export type ReviewAction = 'approving' | 'requesting';

/**
 * Failure of the latest click of an action: the action, and the message of its failure.
 */
export interface ActionFailure {
  /**
   * Action whose click failed.
   */
  readonly action: ReviewAction;

  /**
   * Message of the failure.
   */
  readonly message: string;
}

/**
 * Ticket that a request of changes added while the server refused to approve the reviewed ticket.
 */
interface CreatedTicket {
  /**
   * Ticket that the request added.
   */
  readonly ticket: Ticket;

  /**
   * Message of the refusal of the approval.
   */
  readonly refusal: string;
}

/**
 * What the review of a ticket sends, and the functions that its actions call once the server accepted them.
 */
interface ReviewActionsOptions {
  /**
   * Review that the user wrote.
   */
  readonly draft: ReviewDraft;

  /**
   * Changes of the ticket as the review read them.
   */
  readonly changes: Changes;

  /**
   * Discards the review once it was sent or approved.
   */
  readonly onSent: () => void;

  /**
   * Opens the chat of the session `sessionId`, the orchestrator of the task, once it took over the landing of the task.
   */
  readonly onOpenChat: (sessionId: string) => void;
}

/**
 * State of the actions of a review, with the functions that run them.
 */
export interface ReviewActions {
  /**
   * Action that runs, or `undefined` while none runs.
   */
  readonly action: ReviewAction | undefined;

  /**
   * Failure of the latest click of an action, or `undefined` when it did not fail.
   */
  readonly failure: ActionFailure | undefined;

  /**
   * Ticket that the latest request of changes added while the approval of this ticket was refused, or `undefined`.
   */
  readonly created: CreatedTicket | undefined;

  /**
   * Discards the comments and approves the ticket, then opens the chat of the orchestrator of the task when it took
   * over the landing of the task.
   */
  readonly approve: () => Promise<void>;

  /**
   * Sends the comments as a new ticket, which approves this ticket, then opens the new ticket, or keeps why this ticket
   * was not approved.
   */
  readonly requestChanges: () => Promise<void>;
}

/**
 * Returns the actions of the review of the ticket `ticket` of the task `task`, as `options` says, with their state. A
 * failed action keeps the message of its failure, and never rejects.
 */
export const useReviewActions = (task: TaskSummary, ticket: Ticket, options: ReviewActionsOptions): ReviewActions => {
  const { draft, changes, onSent, onOpenChat } = options;
  const [action, setAction] = useState<ReviewAction>();
  const [failure, setFailure] = useState<ActionFailure>();
  const [created, setCreated] = useState<CreatedTicket>();

  /**
   * Runs the action `name` with `run`, and keeps the message of its failure with its name.
   */
  const runAction = async (name: ReviewAction, run: () => Promise<void>): Promise<void> => {
    setAction(name);
    setFailure(undefined);
    try {
      await run();
    } catch (error) {
      setFailure({ action: name, message: errorMessage(error) });
    } finally {
      setAction(undefined);
    }
  };

  /**
   * Discards the comments and approves the ticket, then opens the chat of the orchestrator of the task when it took
   * over the landing of the task.
   */
  const approve = async (): Promise<void> =>
    runAction('approving', async () => {
      const orchestrator = await approveTicket(task.id, ticket.id);
      onSent();
      if (orchestrator !== undefined) onOpenChat(orchestrator);
    });

  /**
   * Sends the comments as a new ticket, which approves this ticket, then opens the new ticket, or keeps why this ticket
   * was not approved.
   */
  const requestChanges = async (): Promise<void> =>
    runAction('requesting', async () => {
      const files = changes.state === 'loaded' ? changes.files : [];
      const commit = changes.state === 'loaded' ? changes.commit : null;
      const review = reviewMarkdown(draft, files, commit);
      const result = await fetchCall<RequestedChanges>('ticketRequestChanges', {
        taskId: task.id,
        ticketId: ticket.id,
        review,
      });
      onSent();
      if (result.approvalRefusal === null) {
        navigate(ticketPath(taskRefOf(task), ticketRefOf(result.ticket), 'summary'));
      } else {
        setCreated({ ticket: result.ticket, refusal: result.approvalRefusal });
      }
    });

  return { action, failure, created, approve, requestChanges };
};
