import { useEffect, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { serialReads } from '@/api/serial-reads.ts';
import type { LoggedMessage } from '@/api/types.ts';
import type { ChatLogQuery } from '@/chats/chat-list.ts';
import { readChatLog } from '@/console/chat-log.ts';
import { errorMessage } from '@/lib/error-message.ts';

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
 * Log of a chat before its first read.
 */
const EMPTY_LOG: ChatLog = { entries: [], loaded: false, failure: null };

/**
 * Returns the messages that `query` selects, read again each time the counter `messages` changes, as `readChatLog`
 * reads them: the first read takes the latest messages, and each later read the messages after the greatest id that
 * the log holds. Reads never overlap: a change of the counter during a read leads to one more read after it. A failed
 * read keeps the messages, and a failed first read stays a first read. The hook holds the messages of one chat, and
 * keeps the query that it mounted with: use it with a `key` per chat, so that another chat starts with an empty log.
 */
export const useChatLog = (query: ChatLogQuery, messages: number): ChatLog => {
  const [log, setLog] = useState<ChatLog>(EMPTY_LOG);
  const [read] = useState(() => {
    let greatestId: number | undefined;
    return serialReads(async () => {
      try {
        const { fresh, greatestId: greatest } = await readChatLog(query, greatestId, { call: fetchCall });
        greatestId = greatest;
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
