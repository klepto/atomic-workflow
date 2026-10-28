import { z } from 'zod';
import { AGENTS, type RegisteredSession, SESSION_ROLES } from '../storage/session-store.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `sessionRegister`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session, as the agent gives it'),
  agent: z.enum(AGENTS).describe('Agent that the session runs in: claude or codex'),
  directory: z.string().min(1).describe('Absolute path of the directory of the project of the session'),
  startedAt: z.number().int().nonnegative().optional().describe('Time when the session started in ms since the epoch'),
  role: z.enum(SESSION_ROLES).default('orchestrator').describe('Role of the session: orchestrator or subagent'),
  parentId: z.string().min(1).optional().describe('Identifier of the orchestrator session that a subagent runs inside'),
});

/**
 * `Method` named `sessionRegister`, which registers a session and returns it as registered. A session without a start
 * time gets the time of the call, and a session without a role is an orchestrator. A session that it registers works on
 * no task and no ticket, and has no job. A session that is registered already stays as it is. The activity that the
 * session reported before is forgotten, since its log starts anew, so its next status starts a new turn.
 */
export const sessionRegisterMethod: Method<typeof PARAMS, RegisteredSession> = {
  name: 'sessionRegister',
  description: 'Registers a session of an agent in the repository, so that its messages can be logged.',
  agent: false,
  params: PARAMS,
  handle: ({ sessionId, agent, directory, startedAt = Date.now(), role, parentId = null }, { sessions, activity }) => {
    activity.forget(sessionId);
    return sessions.register({
      id: sessionId,
      agent,
      directory,
      startedAt,
      role,
      parentId,
      taskId: null,
      job: null,
      ticketId: null,
      alias: null,
      contextTokens: null,
      model: null,
      effort: null,
    });
  },
};
