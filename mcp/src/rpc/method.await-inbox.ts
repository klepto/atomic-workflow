import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Time in ms that the session server of a new session has to bind it. After `/clear`, the session server notices the
 * new session within a second, and its bind moves the inbox of the old session to it.
 */
const BIND_TIMEOUT = 5_000;

/**
 * Schema of the parameters of `awaitInbox`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Session id of the session whose inbox to wait for'),
});

/**
 * `Method` named `awaitInbox`, which waits up to `BIND_TIMEOUT` ms for the session `sessionId` to have an inbox, and
 * returns the command line that waits for its messages. If no inbox opens by then, returns `null` as the command line
 * instead. Agents do not call it as a tool.
 */
export const awaitInboxMethod: Method<typeof PARAMS, { readonly commandLine: string | null }> = {
  name: 'awaitInbox',
  description:
    'Waits a few seconds for a session to have an inbox, and returns the command that waits for its messages.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { inboxes, awaitCommandLine }) => {
    const opened = await inboxes.awaitOpen(sessionId, BIND_TIMEOUT);
    return { commandLine: opened ? awaitCommandLine(sessionId) : null };
  },
};
