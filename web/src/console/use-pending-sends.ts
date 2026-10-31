import { useEffect, useRef, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { Skill } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { type PendingRoute, planSend } from '@/console/send-plan.ts';
import { errorMessage } from '@/lib/error-message.ts';

/**
 * Message of the user that the log does not show yet: one being delivered, or one whose delivery failed.
 */
export interface PendingMessage {
  /**
   * Key of the message, which no other pending message has.
   */
  readonly key: number;

  /**
   * Text of the message as it is sent.
   */
  readonly text: string;

  /**
   * Route of the message.
   */
  readonly route: PendingRoute;

  /**
   * State of the message: `sending` while its call runs, `failed` once it failed.
   */
  readonly state: 'sending' | 'failed';

  /**
   * Message of the failure of a `failed` message.
   */
  readonly error?: string;
}

/**
 * Options of `usePendingSends`: the calls of the page that a send needs.
 */
interface PendingSendsOptions {
  /**
   * Opens the chat with the key `key`, such as the chat of a subagent that a skill started.
   */
  readonly onOpen: (key: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readonly readSessions: () => Promise<void>;
}

/**
 * Sends of a chat that the log does not show yet, and the calls that drive them.
 */
interface PendingSends {
  /**
   * Pending messages in the order in which they were sent.
   */
  readonly pending: readonly PendingMessage[];

  /**
   * Sends the text `text` to the attached session `sessionId` of the chat. Resolves once the text was sent, or its
   * failure shows.
   */
  readonly send: (sessionId: string, text: string) => Promise<void>;

  /**
   * Removes the pending message with the key `key`.
   */
  readonly discard: (key: number) => void;
}

/**
 * Result of `subagentStart`.
 */
interface SubagentStartResult {
  /**
   * Identifier of the session of the new subagent.
   */
  readonly sessionId: string;
}

/**
 * Returns the sends of the chat `chat`, which match a text against the skills `skills` of its session, with the calls
 * of the page `options`, on the route that `planSend` picks. A text that runs a skill is sent with the whole name of
 * the skill in place of its command. In the chat of the main session, such a text starts a new subagent inside the
 * session with `subagentStart`, with the text as its first message, and the subagent works on no task until its skill
 * picks one. Once the subagent attached, the sessions are read again and its chat opens, unless the console closed
 * meanwhile. Every other text goes to the session of the chat with `messageDeliver`. Each text shows as pending until
 * its call settles: a text whose call succeeded leaves the pending messages, and a failed one stays with the message
 * of the failure.
 */
export const usePendingSends = (
  chat: Chat,
  skills: readonly Skill[] | undefined,
  options: PendingSendsOptions,
): PendingSends => {
  const { onOpen, readSessions } = options;
  const [pending, setPending] = useState<readonly PendingMessage[]>([]);
  const lastKey = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Removes the pending message with the key `key`.
   */
  const discard = (key: number): void => setPending((current) => current.filter((message) => message.key !== key));

  /**
   * Marks the pending message with the key `key` as failed, with the message of the failure `error`.
   */
  const fail = (key: number, error: unknown): void =>
    setPending((current) =>
      current.map((message) =>
        message.key === key ? { ...message, state: 'failed', error: errorMessage(error) } : message,
      ),
    );

  /**
   * Shows the text `text` as pending on the route `route` until `run` settles. Resolves once it settled.
   */
  const track = async (text: string, route: PendingRoute, run: () => Promise<unknown>): Promise<void> => {
    lastKey.current += 1;
    const key = lastKey.current;
    setPending((current) => [...current, { key, text, route, state: 'sending' }]);
    try {
      await run();
      discard(key);
    } catch (error) {
      fail(key, error);
    }
  };

  /**
   * Starts a subagent inside the session `parentId` with the text `text` as its first message, then reads the sessions
   * again and opens the chat of the subagent, unless the console closed meanwhile. Rejects when a call fails.
   */
  const startSubagent = async (parentId: string, text: string): Promise<void> => {
    const { sessionId } = await fetchCall<SubagentStartResult>('subagentStart', { prompt: text, parentId });
    await readSessions();
    if (mounted.current) {
      onOpen(sessionId);
    }
  };

  /**
   * Sends the text `text` to the attached session `sessionId` of the chat, on the route that the text and the chat
   * pick. Resolves once the text was sent, or its failure shows.
   */
  const send = (sessionId: string, text: string): Promise<void> => {
    const plan = planSend(text, chat.role, skills ?? []);
    return plan.route === 'subagent'
      ? track(plan.text, plan.route, () => startSubagent(sessionId, plan.text))
      : track(plan.text, plan.route, () => fetchCall('messageDeliver', { sessionId, content: plan.text }));
  };

  return { pending, send, discard };
};
