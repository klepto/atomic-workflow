import { z } from 'zod';
import type { SessionRole } from '../storage/session-store.ts';
import type { Method, MethodContext } from './method.ts';

/**
 * Schema of the parameters of `sessionList`.
 */
const PARAMS = z.object({
  attached: z
    .boolean()
    .optional()
    .describe(
      'true for only the attached sessions, which can take a message now, false for only the others, all when left out',
    ),
});

/**
 * Session of the repository, attached or not.
 */
interface ListedSession {
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

  /**
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  readonly attached: boolean;
}

/**
 * `Method` named `sessionList`, which returns the sessions of the repository: the attached ones first, then the
 * registered ones that are not attached, in the order of their start. With `attached`, it returns only the attached
 * sessions or only the others.
 */
export const sessionListMethod: Method<typeof PARAMS, { readonly sessions: readonly ListedSession[] }> = {
  name: 'sessionList',
  description:
    'Returns the sessions and subagents of the repository, and whether each one is attached, so messages can be delivered to it now.',
  agent: false,
  params: PARAMS,
  handle: async ({ attached }, context) => {
    const live = attachedSessions(context);
    if (attached === true) return { sessions: live };
    const liveIds = new Set(live.map(({ sessionId }) => sessionId));
    const others = (await context.sessions.list())
      .filter(({ id }) => !liveIds.has(id))
      .map(({ id, role, parentId }) => ({ sessionId: id, role, parentId, attached: false }));
    return { sessions: attached === false ? others : [...live, ...others] };
  },
};

/**
 * Returns the sessions that attached session servers serve now, with the services of `context`, in the order in which
 * they were bound, the latest last, followed by the attached subagents, in the order of their start.
 */
const attachedSessions = ({ sessionConnections, subagents }: MethodContext): ListedSession[] => [
  ...sessionConnections
    .list()
    .map((sessionId) => ({ sessionId, role: 'orchestrator' as const, parentId: null, attached: true })),
  ...subagents
    .list()
    .map(({ sessionId, parentId }) => ({ sessionId, role: 'subagent' as const, parentId, attached: true })),
];
