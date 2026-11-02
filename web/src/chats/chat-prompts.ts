import type { PermissionPrompt } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';

/**
 * Returns the open permission prompts `prompts` by the key of the chat that shows each, among the chats `chats`: the
 * chat that holds the session of the prompt, else the chat of the main session, which holds every orchestrator
 * session. The prompts of each chat are oldest first. A chat with no open prompt has no entry. A prompt of no chat of
 * `chats` is left out while `chats` has no chat of the main session.
 */
export const promptsByChat = (
  prompts: readonly PermissionPrompt[],
  chats: readonly Chat[],
): ReadonlyMap<string, readonly PermissionPrompt[]> => {
  const main = chats.find((chat) => chat.role === 'orchestrator');
  const groups = new Map<string, PermissionPrompt[]>();
  const oldestFirst = prompts.toSorted((first, second) => first.openedAt - second.openedAt);
  for (const prompt of oldestFirst) {
    const chat = chats.find((candidate) => candidate.sessionIds.includes(prompt.sessionId)) ?? main;
    if (chat === undefined) continue;
    const group = groups.get(chat.key);
    if (group === undefined) groups.set(chat.key, [prompt]);
    else group.push(prompt);
  }
  return groups;
};
