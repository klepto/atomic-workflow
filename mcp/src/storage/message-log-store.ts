import type { SessionRole } from './session-store.ts';

/**
 * Senders of a logged message: `user` for a message of the user, and `agent` for a message of the agent.
 */
export const MESSAGE_SENDERS = ['user', 'agent'] as const;

/**
 * Sender of a logged message, one of `MESSAGE_SENDERS`.
 */
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

/**
 * Message to add to the message log.
 */
export interface NewMessage {
  /**
   * Identifier of the registered session that the message belongs to.
   */
  readonly sessionId: string;

  /**
   * Identifier that the agent gives the message, unique in its session, or `null` for none.
   */
  readonly messageId: string | null;

  /**
   * Who wrote the message.
   */
  readonly sender: MessageSender;

  /**
   * Text of the message.
   */
  readonly content: string;

  /**
   * Time of the message, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Message in the message log.
 */
export interface LoggedMessage extends NewMessage {
  /**
   * Identifier of the message. A message added later has a greater identifier.
   */
  readonly id: number;
}

/**
 * Selection of messages of the message log.
 */
export interface MessageQuery {
  /**
   * Identifier of the session whose messages to select, or `undefined` for the messages of every session.
   */
  readonly sessionId: string | undefined;

  /**
   * Role of the sessions whose messages to select, or `undefined` for the messages of every role.
   */
  readonly role: SessionRole | undefined;

  /**
   * Identifier after which the selection starts, or `undefined` for the latest messages. Only messages with a greater
   * identifier are selected.
   */
  readonly after: number | undefined;

  /**
   * Greatest number of messages to select. From the start of the selection on, or with `after` left out, the latest
   * ones.
   */
  readonly limit: number;
}

/**
 * Store of the message log of a repository, which grows, except when the messages of a session are deleted.
 */
export interface MessageLogStore {
  /**
   * Adds `message` to the end of the log, and returns it as logged. A message with the message id of a message
   * that its session has logged already is not added again, and the logged message is returned instead.
   * If the session of `message` is not registered, rejects.
   */
  append(message: NewMessage): Promise<LoggedMessage>;

  /**
   * Returns the messages that `query` selects, in the order of the log.
   */
  list(query: MessageQuery): Promise<readonly LoggedMessage[]>;

  /**
   * Deletes every message of the session `sessionId` from the log, and returns how many it deleted.
   */
  deleteSession(sessionId: string): Promise<number>;
}
