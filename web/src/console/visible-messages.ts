import type { LoggedMessage } from '@/api/types.ts';
import { isTaskNotification } from '@/conversation/task-notification.ts';
import { withoutWorkflowQuotes } from '@/conversation/workflow-quote.ts';

/**
 * Returns the messages of `logged` that the log shows: none that notifies that a background task ended, and each
 * without the marked quotes of the atomic-workflow server at its start and at its end, such as the messages that an
 * agent quotes before its reply, or the word that ends the turn of a subagent after its reply. A message that holds
 * only marked quotes is not shown.
 */
export const visibleMessages = (logged: readonly LoggedMessage[]): readonly LoggedMessage[] =>
  logged
    .filter((message) => !isTaskNotification(message.content))
    .map((message) => ({ ...message, content: withoutWorkflowQuotes(message.content) }))
    .filter((message) => message.content.trim() !== '');

/**
 * Returns the ids of the messages of `entries` that belong to another session than the message before them.
 */
export const sessionBreaks = (entries: readonly LoggedMessage[]): ReadonlySet<number> =>
  new Set(
    entries
      .filter((message, index) => index > 0 && message.sessionId !== entries[index - 1]?.sessionId)
      .map((message) => message.id),
  );
