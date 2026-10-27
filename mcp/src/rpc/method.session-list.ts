import { z } from 'zod';
import type { ActivityStatus } from '../attachment/session-activity.ts';
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
 * Status of a listed session: `ended` for a session that is not attached, and the status of its agent for an attached
 * one.
 */
type SessionStatus = 'ended' | ActivityStatus;

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
   * Identifier of the task that the session works on, or `null` for a session that was started for no task.
   */
  readonly taskId: number | null;

  /**
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  readonly attached: boolean;

  /**
   * Status of the session. An attached session that has reported no status is `idle`.
   */
  readonly status: SessionStatus;
}

/**
 * `Method` named `sessionList`, which returns the sessions of the repository: the attached ones first, then the
 * registered ones that are not attached, in the order of their start, each with its status and the task that it works
 * on. With `attached`, it returns only the attached sessions or only the others.
 */
export const sessionListMethod: Method<typeof PARAMS, { readonly sessions: readonly ListedSession[] }> = {
  name: 'sessionList',
  description:
    'Returns the sessions and subagents of the repository, whether each one is attached, so messages can be delivered to it now, and whether its agent is idle, works, waits for the user, or has ended.',
  agent: false,
  params: PARAMS,
  handle: async ({ attached }, context) => {
    const registered = await context.sessions.list();
    const taskIds = new Map(registered.map(({ id, taskId }) => [id, taskId]));
    const live = attachedSessions(context).map((session) => ({
      ...session,
      taskId: taskIds.get(session.sessionId) ?? null,
    }));
    if (attached === true) return { sessions: live };
    const liveIds = new Set(live.map(({ sessionId }) => sessionId));
    const others = registered
      .filter(({ id }) => !liveIds.has(id))
      .map(({ id, role, parentId, taskId }) => ({
        sessionId: id,
        role,
        parentId,
        taskId,
        attached: false,
        status: 'ended' as const,
      }));
    return { sessions: attached === false ? others : [...live, ...others] };
  },
};

/**
 * Returns the sessions that attached session servers serve now, with the services of `context`, in the order in which
 * they were bound, the latest last, followed by the attached subagents, in the order of their start, each with the
 * status of its agent, without the task that it works on.
 */
const attachedSessions = ({
  sessionConnections,
  subagents,
  activity,
}: MethodContext): Omit<ListedSession, 'taskId'>[] => [
  ...sessionConnections.list().map((sessionId) => ({
    sessionId,
    role: 'orchestrator' as const,
    parentId: null,
    attached: true,
    status: activity.get(sessionId) ?? 'idle',
  })),
  ...subagents.list().map(({ sessionId, parentId }) => ({
    sessionId,
    role: 'subagent' as const,
    parentId,
    attached: true,
    status: activity.get(sessionId) ?? 'idle',
  })),
];
