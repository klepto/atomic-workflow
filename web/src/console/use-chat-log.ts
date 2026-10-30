import { useEffect, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { serialReads } from '@/api/serial-reads.ts';
import type { LoggedMessage } from '@/api/types.ts';
import type { ChatLogQuery } from '@/chats/chat-list.ts';
import { errorMessage } from '@/lib/error-message.ts';

/**
 * Number of the latest messages that the first read of a chat takes.
 */
const FIRST_LIMIT = 100;

/**
 * Greatest number of messages that each later read of a chat takes.
 */
const LATER_LIMIT = 1000;

/**
 * Messages of a chat as the page knows them.
 */
interface ChatLog {
  /**
   * Messages of the chat in the order of the log, oldest first.
   */
  readonly entries: readonly LoggedMessage[];

  /**
   * Whether a read of the chat succeeded once.
   */
  readonly loaded: boolean;

  /**
   * Message of the latest failed read, or `null` when the latest read succeeded.
   */
  readonly failure: string | null;
}

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
 * Log of a chat before its first read.
 */
const EMPTY_LOG: ChatLog = { entries: [], loaded: false, failure: null };

/**
 * Returns the messages that `query` selects, read again each time the counter `messages` changes. The first read takes
 * the latest `FIRST_LIMIT` messages. Each later read takes the messages after the greatest id it holds, at most
 * `LATER_LIMIT`. Reads never overlap: a change of the counter during a read leads to one more read after it. A failed
 * read keeps the messages, and a failed first read stays a first read. The hook holds the messages of one chat, and
 * keeps the query that it mounted with: use it with a `key` per chat, so that another chat starts with an empty log.
 */
export const useChatLog = (query: ChatLogQuery, messages: number): ChatLog => {
  const [log, setLog] = useState<ChatLog>(EMPTY_LOG);
  const [read] = useState(() => {
    let greatestId: number | undefined;
    return serialReads(async () => {
      const after = greatestId;
      try {
        const result = await fetchCall<MessageListResult>(
          'messageList',
          after === undefined ? { ...query, limit: FIRST_LIMIT } : { ...query, after, limit: LATER_LIMIT },
        );
        const fresh = after === undefined ? result.messages : result.messages.filter((message) => message.id > after);
        greatestId = fresh.reduce((max, message) => Math.max(max, message.id), after ?? 0);
        setLog((current) => ({
          entries: fresh.length === 0 ? current.entries : [...current.entries, ...fresh],
          loaded: true,
          failure: null,
        }));
      } catch (error) {
        setLog((current) => ({ ...current, failure: errorMessage(error) }));
      }
    });
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the chat is read again each time the counter changes.
  useEffect(() => {
    void read();
  }, [read, messages]);

  return log;
};
