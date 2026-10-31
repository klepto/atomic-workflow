import type { CallFunction } from '@/api/rpc.ts';
import type { LoggedMessage } from '@/api/types.ts';
import type { ChatLogQuery } from '@/chats/chat-list.ts';

/**
 * Number of the latest messages that the first read of a chat takes.
 */
const FIRST_LIMIT = 100;

/**
 * Greatest number of messages that each later read of a chat takes.
 */
const LATER_LIMIT = 1000;

/**
 * Result of `messageList`.
 */
interface MessageListResult {
  /**
   * Messages that the query selects, oldest first.
   */
  readonly messages: readonly LoggedMessage[];
}

/**
 * Adapters that `readChatLog` needs.
 */
interface ChatLogDependencies {
  /**
   * Sends `messageList` to the server.
   */
  readonly call: CallFunction;
}

/**
 * Result of `readChatLog`.
 */
interface ChatLogRead {
  /**
   * Messages that the read found after the ones that the log holds, oldest first.
   */
  readonly fresh: readonly LoggedMessage[];

  /**
   * Greatest id of the messages that the log holds once it takes `fresh`, or 0 while it holds none.
   */
  readonly greatestId: number;
}

/**
 * Reads the messages that `query` selects after the message `after`, the greatest id that the log of the chat holds,
 * with `messageList` through `call` of `dependencies`. The first read, with `after` `undefined`, takes the latest
 * `FIRST_LIMIT` messages. Each later read takes the messages after `after`, at most `LATER_LIMIT`, and drops any that
 * the server answers at or below it. Returns the fresh messages with the greatest id that the log holds then. Rejects
 * when the call fails.
 */
export const readChatLog = async (
  query: ChatLogQuery,
  after: number | undefined,
  dependencies: ChatLogDependencies,
): Promise<ChatLogRead> => {
  const result = await dependencies.call<MessageListResult>(
    'messageList',
    after === undefined ? { ...query, limit: FIRST_LIMIT } : { ...query, after, limit: LATER_LIMIT },
  );
  const fresh = after === undefined ? result.messages : result.messages.filter((message) => message.id > after);
  return { fresh, greatestId: fresh.reduce((max, message) => Math.max(max, message.id), after ?? 0) };
};
