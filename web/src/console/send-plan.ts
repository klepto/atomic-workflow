import type { Skill } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { expandCommand, skillOf } from '@/commands/skill-commands.ts';

/**
 * Route of a pending message: `deliver` to the session of the chat with `messageDeliver`, and `subagent` to a new
 * subagent with `subagentStart`, as the first message of the subagent.
 */
export type PendingRoute = 'deliver' | 'subagent';

/**
 * How a text of the user goes out: its route, and the text as it is sent.
 */
interface SendPlan {
  /**
   * Route of the text.
   */
  readonly route: PendingRoute;

  /**
   * Text as it is sent.
   */
  readonly text: string;
}

/**
 * Returns how the text `text` goes out from the chat of the role `role`, matched against the skills `skills` of its
 * session. A text that runs a skill is sent with the whole name of the skill in place of its command, on the route
 * `subagent` from the chat of the main session, and `deliver` from the chat of a subagent. Every other text goes as it
 * is on the route `deliver`.
 */
export const planSend = (text: string, role: Chat['role'], skills: readonly Skill[]): SendPlan => {
  const skill = skillOf(text, skills);
  if (skill === undefined) {
    return { route: 'deliver', text };
  }
  return { route: role === 'subagent' ? 'deliver' : 'subagent', text: expandCommand(text, skill) };
};
