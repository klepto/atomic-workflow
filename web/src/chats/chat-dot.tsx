import type { ChatStatus } from '@/chats/chat-list.ts';
import { CHAT_STATUSES } from '@/chats/chat-statuses.ts';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `ChatDot`.
 */
interface ChatDotProps {
  /**
   * Status of the chat.
   */
  readonly status: ChatStatus;
}

/**
 * Dot in front of the name of a chat, in the look of its status `status`, with the words of the status on hover. A
 * screen reader skips it, so the name of the chat must say the words of the status.
 */
export const ChatDot = ({ status }: ChatDotProps) => (
  <span
    aria-hidden="true"
    title={CHAT_STATUSES[status].words}
    className={cn('inline-block size-2 shrink-0 rounded-full', CHAT_STATUSES[status].dot)}
  />
);
