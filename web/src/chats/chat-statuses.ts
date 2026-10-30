import type { ChatStatus } from '@/chats/chat-list.ts';

/**
 * Look of the dot of a status, and the words that say the same to a screen reader.
 */
interface ChatStatusLook {
  /**
   * Classes of the dot.
   */
  readonly dot: string;

  /**
   * Words of the status, such as `waits for you`.
   */
  readonly words: string;
}

/**
 * Look of the dot of each status, and the words that say the same to a screen reader. Each status has its own shape
 * besides its color, so that it reads without color too: a hollow ring once ended, a dot while idle, a pulsing dot
 * while working, and a dot with a halo while waiting.
 */
export const CHAT_STATUSES: Readonly<Record<ChatStatus, ChatStatusLook>> = {
  ended: { dot: 'border border-muted-foreground/60', words: 'ended' },
  idle: { dot: 'bg-green-500', words: 'idle' },
  working: { dot: 'bg-yellow-500 motion-safe:animate-pulse', words: 'working' },
  waiting: { dot: 'bg-red-500 ring-[3px] ring-red-500/30', words: 'waits for you' },
};
