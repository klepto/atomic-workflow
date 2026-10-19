import { z } from 'zod';
import { AGENTS, type RegisteredSession } from '../storage/session-store.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `registerSession`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session, as the agent gives it'),
  agent: z.enum(AGENTS).describe('Agent that the session runs in: claude or codex'),
  directory: z.string().min(1).describe('Absolute path of the directory of the project of the session'),
  startedAt: z.number().int().nonnegative().optional().describe('Time when the session started in ms since the epoch'),
});

/**
 * `Method` named `registerSession`, which registers a session and returns it as registered. A session without a start
 * time gets the time of the call. A session that is registered already stays as it is.
 */
export const registerSessionMethod: Method<typeof PARAMS, RegisteredSession> = {
  name: 'registerSession',
  description: 'Registers a session of an agent in the repository, so that its messages can be logged.',
  agent: false,
  params: PARAMS,
  handle: ({ sessionId, agent, directory, startedAt = Date.now() }, { sessions }) =>
    sessions.register({ id: sessionId, agent, directory, startedAt }),
};
