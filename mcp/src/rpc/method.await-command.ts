import { z } from 'zod';
import type { SubagentCommand } from '../attachment/subagents.ts';
import type { Method } from './method.ts';

/**
 * Time in ms that `awaitCommand` waits for a message before it returns an `idle` command, 23 hours. It stays below the
 * timeout of a tool call that the plugin gives the session server, 24 hours, so the call never fails while it waits.
 */
const WAIT_TIMEOUT = 23 * 60 * 60_000;

/**
 * Schema of the parameters of `awaitCommand`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Session id of the subagent, as its prompt gives it'),
});

/**
 * `Method` named `awaitCommand`, which attaches a subagent and returns its next command. It waits up to
 * `WAIT_TIMEOUT` ms for a message, and returns an `idle` command when none comes.
 */
export const awaitCommandMethod: Method<typeof PARAMS, SubagentCommand> = {
  name: 'awaitCommand',
  description:
    'Waits for the next command of an atomic-workflow subagent. Call it only as a subagent whose prompt tells you ' +
    'to, with the session id from that prompt. Returns status "command" with the content to carry out, "idle" when ' +
    'no command came in time, or "stop" when the subagent ends.',
  agent: true,
  params: PARAMS,
  handle: ({ sessionId }, { subagents }) => subagents.awaitCommand(sessionId, AbortSignal.timeout(WAIT_TIMEOUT)),
};
