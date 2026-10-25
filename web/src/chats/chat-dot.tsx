import { cn } from '@/lib/utils.ts';

/**
 * What the dot in front of a chat says: its agent works, its agent is blocked until the user writes to it, it holds a
 * message that the user did not see, or none of these.
 */
export type ChatMark = 'working' | 'blocked' | 'unread' | 'quiet';

/**
 * The color of the dot of each mark, and the words that say the same to a screen reader.
 */
export const CHAT_MARKS: Record<ChatMark, { dot: string; words: string | undefined }> = {
  working: { dot: 'bg-yellow-500 motion-safe:animate-pulse', words: 'working' },
  blocked: { dot: 'bg-red-500', words: 'waits for you' },
  unread: { dot: 'bg-green-500', words: 'new messages' },
  quiet: { dot: 'bg-muted-foreground/40', words: undefined },
};

/**
 * The dot in front of the name of a chat, in the color of its mark `mark`.
 */
export const ChatDot = ({ mark }: { mark: ChatMark }) => (
  <span
    aria-hidden="true"
    title={CHAT_MARKS[mark].words}
    className={cn('inline-block size-2 shrink-0 rounded-full', CHAT_MARKS[mark].dot)}
  />
);
