import { z } from 'zod';
import type { InboxDelivery } from '../attachment/inboxes.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `inboxAwaitCommand`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Session id of the session or subagent that waits, or its beginning'),
  after: z.number().int().min(0).default(0).describe('Number of the last message that the session has received'),
});

/**
 * Result of `inboxAwaitCommand`: the outcome of the wait, and whether the session that waits is a started subagent.
 */
export type AwaitCommandResult = InboxDelivery & { readonly subagent: boolean };

/**
 * `Method` named `inboxAwaitCommand`, which acknowledges the messages of a session up to the number `after`, and returns
 * the messages that are left, or waits for the next one. The session may be named by the beginning of its id. It waits as long as it takes, and ends with `stop` once the
 * session can take no more messages, or with `replaced` once a newer wait of the session takes over. The first call
 * of a started subagent attaches it, and each result tells whether the session is a started subagent. Agents do not call it as a tool, but run the command line tool that calls it in
 * the background, so the wait blocks no turn of the agent.
 */
export const inboxAwaitCommandMethod: Method<typeof PARAMS, AwaitCommandResult> = {
  name: 'inboxAwaitCommand',
  description: 'Waits for the next messages of a session or a subagent, and acknowledges the ones before.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId: name, after }, { subagents, inboxes }) => {
    const sessionId = inboxes.find(name) ?? name;
    subagents.attach(sessionId);
    const subagent = subagents.list().some((attached) => attached.sessionId === sessionId);
    return { ...(await inboxes.take(sessionId, after)), subagent };
  },
};
