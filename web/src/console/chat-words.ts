import type { Chat } from '@/chats/chat-list.ts';

/**
 * Returns the words by which the console names the chat `chat`: `the main session`, or the label of a subagent.
 */
export const chatWords = (chat: Chat): string => (chat.role === 'orchestrator' ? 'the main session' : chat.label);
