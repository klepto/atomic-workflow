import { z } from 'zod';
import type { SessionRole } from '../storage/session-store.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `listAttachedSessions`, which takes none.
 */
const PARAMS = z.object({});

/**
 * Session that can take a message of `deliverMessage` now.
 */
interface AttachedSession {
  /**
   * Identifier of the session.
   */
  readonly sessionId: string;

  /**
   * Role of the session.
   */
  readonly role: SessionRole;

  /**
   * Identifier of the orchestrator session that a subagent runs inside, or `null` for an orchestrator session.
   */
  readonly parentId: string | null;
}

/**
 * `Method` named `listAttachedSessions`, which returns the sessions that attached session servers serve now, in the
 * order in which they were bound, the latest last, followed by the attached subagents, in the order of their start.
 * Each of them can take a message of `deliverMessage`.
 */
export const listAttachedSessionsMethod: Method<typeof PARAMS, { readonly sessions: readonly AttachedSession[] }> = {
  name: 'listAttachedSessions',
  description: 'Returns the sessions and subagents of the repository that messages can be delivered to now.',
  agent: false,
  params: PARAMS,
  handle: async (_params, { sessionConnections, subagents }) => ({
    sessions: [
      ...sessionConnections.list().map((sessionId) => ({ sessionId, role: 'orchestrator' as const, parentId: null })),
      ...subagents.list().map(({ sessionId, parentId }) => ({ sessionId, role: 'subagent' as const, parentId })),
    ],
  }),
};
