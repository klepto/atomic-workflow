/**
 * Message in an inbox, with the number that its inbox gives it. The numbers of an inbox grow by one per message, from
 * 1.
 */
export interface InboxMessage {
  /**
   * Number of the message in its inbox.
   */
  readonly id: number;

  /**
   * Text of the message.
   */
  readonly content: string;
}

/**
 * Outcome of a wait for the messages of an inbox. `messages` carries every message that the session has not
 * acknowledged yet, the oldest first, with the session that the inbox belongs to now, which differs from the session
 * of the wait once the inbox has moved. `stop` means that the inbox is closed, and `replaced` means that a newer wait
 * of the same session took over.
 */
export type InboxDelivery =
  | { readonly status: 'messages'; readonly sessionId: string; readonly messages: readonly InboxMessage[] }
  | { readonly status: 'stop' }
  | { readonly status: 'replaced' };

/**
 * Inboxes of the sessions that the repository server delivers messages to, by session. A session takes its messages
 * with a wait, and acknowledges them with its next wait, so a message that a wait took but that never reached the agent
 * comes again with the next wait.
 */
export interface Inboxes {
  /**
   * Opens an empty inbox for the session `sessionId`, which closes when `closed` resolves. A session whose inbox is
   * open already keeps it, and the kept inbox still closes with the `closed` that it was opened with first.
   */
  open(sessionId: string, closed: Promise<void>): void;

  /**
   * Moves the inbox of the session `from`, with its messages and its wait, to the session `to`. If `to` has an inbox
   * already, closes the inbox of `from` instead. If `from` has no inbox, does nothing.
   */
  move(from: string, to: string): void;

  /**
   * Closes the inbox of the session `sessionId`, which ends its wait with `stop`, and returns `true`. If the session
   * has no inbox, returns `false` instead.
   */
  close(sessionId: string): boolean;

  /**
   * Returns the session whose inbox is open under the identifier `sessionId`, or under the session id that `sessionId`
   * begins. If no open inbox matches, or more than one session id begins with `sessionId`, returns `undefined`
   * instead.
   */
  find(sessionId: string): string | undefined;

  /**
   * Returns `true` once the session `sessionId` has an open inbox, at once if it has one already. An inbox that moves
   * to the session counts as opened. If no inbox opens within `timeout` ms, returns `false` instead.
   */
  awaitOpen(sessionId: string, timeout: number): Promise<boolean>;

  /**
   * Puts the message `content` into the inbox of the session `sessionId`, and returns `true`. The wait of the session
   * ends a short delay later, with every message that came in by then, so that a burst of messages wakes the agent
   * once. If the session has no inbox, returns `false` instead.
   */
  deliver(sessionId: string, content: string): boolean;

  /**
   * Acknowledges the messages of the session `sessionId` up to the number `after`, and returns the messages that are
   * left. With none left, waits for the next message. A second wait of the session ends the first with `replaced`. A
   * session without an inbox, or whose inbox closes during the wait, gets `stop`.
   */
  take(sessionId: string, after: number): Promise<InboxDelivery>;
}

/**
 * Function that returns new inboxes, with no inbox open.
 */
export type CreateInboxesFunction = () => Inboxes;
