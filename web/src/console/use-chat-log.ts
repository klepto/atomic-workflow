import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { LoggedMessage } from '@/api/types.ts';

/**
 * The number of the latest messages that the first read of a chat takes.
 */
const FIRST_LIMIT = 100;

/**
 * The greatest number of messages that each later read of a chat takes.
 */
const LATER_LIMIT = 1000;

/**
 * The messages of a chat as the page knows them.
 */
export interface ChatLog {
  /**
   * The messages of the chat in the order of the log, oldest first.
   */
  entries: readonly LoggedMessage[];

  /**
   * Whether a read of the chat succeeded once.
   */
  loaded: boolean;

  /**
   * The message of the latest failed read, or `null` when the latest read succeeded.
   */
  failure: string | null;
}

/**
 * The log of a chat before its first read.
 */
const EMPTY_LOG: ChatLog = { entries: [], loaded: false, failure: null };

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Returns the messages of the session `sessionId`, read again each time the counter `messages` changes. The first
 * read takes the latest 100 messages. Each later read takes the messages after the greatest id it holds, at most
 * 1000. Reads never overlap: a change of the counter during a read leads to one more read after it. A failed read
 * keeps the messages, and a failed first read stays a first read. The hook holds the messages of one session: use it
 * with a `key` per session, so that another session starts with an empty log.
 */
export const useChatLog = (sessionId: string, messages: number): ChatLog => {
  const [log, setLog] = useState<ChatLog>(EMPTY_LOG);
  const greatestId = useRef<number | undefined>(undefined);
  const running = useRef(false);
  const queued = useRef(false);
  const mounted = useRef(true);

  /**
   * Reads the chat once: the latest messages until a read succeeded, and the messages after the greatest id held
   * then. Adds the messages that it reads, or sets the failure.
   */
  const readOnce = useCallback(async () => {
    const after = greatestId.current;
    try {
      const result = await call<{ messages: readonly LoggedMessage[] }>(
        'messageList',
        after === undefined ? { sessionId, limit: FIRST_LIMIT } : { sessionId, after, limit: LATER_LIMIT },
      );
      if (!mounted.current) {
        return;
      }
      const fresh = after === undefined ? result.messages : result.messages.filter((message) => message.id > after);
      greatestId.current = fresh.reduce((max, message) => Math.max(max, message.id), after ?? 0);
      setLog((current) => ({
        entries: fresh.length === 0 ? current.entries : [...current.entries, ...fresh],
        loaded: true,
        failure: null,
      }));
    } catch (error) {
      if (mounted.current) {
        setLog((current) => ({ ...current, failure: messageOf(error) }));
      }
    }
  }, [sessionId]);

  /**
   * Reads the chat, or queues one more read while a read runs.
   */
  const read = useCallback(async () => {
    if (running.current) {
      queued.current = true;
      return;
    }
    running.current = true;
    do {
      queued.current = false;
      await readOnce();
    } while (queued.current && mounted.current);
    running.current = false;
  }, [readOnce]);

  // Declared before the effect that reads, so that a mount sets `mounted` before the first read starts.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the chat is read again each time the counter changes.
  useEffect(() => {
    void read();
  }, [read, messages]);

  return log;
};
