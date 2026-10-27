import type { ChatStatus } from '@/chats/chat-list.ts';
import { cn } from '@/lib/utils.ts';

/**
 * The look of the dot of each status, and the words that say the same to a screen reader. Each status has its own
 * shape besides its color, so that it reads without color too: a hollow ring once ended, a dot while idle, a pulsing
 * dot while working, and a dot with a halo while waiting.
 */
export const CHAT_STATUSES: Record<ChatStatus, { dot: string; words: string }> = {
  ended: { dot: 'border border-muted-foreground/60', words: 'ended' },
  idle: { dot: 'bg-green-500', words: 'idle' },
  working: { dot: 'bg-yellow-500 motion-safe:animate-pulse', words: 'working' },
  waiting: { dot: 'bg-red-500 ring-[3px] ring-red-500/30', words: 'waits for you' },
};

/**
 * The dot in front of the name of a chat, in the look of its status `status`, with the words of the status on hover.
 * A screen reader skips it, so the name of the chat must say the words of the status.
 */
export const ChatDot = ({ status }: { status: ChatStatus }) => (
  <span
    aria-hidden="true"
    title={CHAT_STATUSES[status].words}
    className={cn('inline-block size-2 shrink-0 rounded-full', CHAT_STATUSES[status].dot)}
  />
);
