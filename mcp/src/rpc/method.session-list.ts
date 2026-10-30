import { z } from 'zod';
import type { Activity, ActivityStatus } from '../attachment/session-activity.ts';
import type { RegisteredSession, SessionRole } from '../storage/session-store.ts';
import type { Method, MethodContext } from './method.ts';
import { baseNameOf, sessionNames } from './session-name.ts';

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
   * Identifier of the ticket of the task `taskId` that the session works on, or `null` for none.
   */
  readonly ticketId: number | null;

  /**
   * Job of a subagent, such as `plan`, `implement` or `orchestrator`, or `null` for a session with no known job.
   */
  readonly job: string | null;

  /**
   * Alias of the session, or `null` for a session that no feature named.
   */
  readonly alias: string | null;

  /**
   * Name of the chat of the session: `main` for an orchestrator session, and for a subagent its alias, or else its job
   * with the slug of its target, such as `implement-cache-key-format`, unique among the subagents with no alias.
   */
  readonly name: string;

  /**
   * Time when the session started, in ms since the epoch, or `null` for an attached session that is not registered.
   */
  readonly startedAt: number | null;

  /**
   * Time of the latest message of the session in the message log, in ms since the epoch, or `null` for none.
   */
  readonly lastActivityAt: number | null;

  /**
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  readonly attached: boolean;

  /**
   * Status of the session. An attached session that has reported no status is `idle`.
   */
  readonly status: SessionStatus;

  /**
   * Time when the current turn of the session started, in ms since the epoch: the time of the first transcript entry
   * of the turn. Non-null while `status` is `working` or `waiting`, and `null` while it is `idle` or `ended`.
   */
  readonly turnStartedAt: number | null;

  /**
   * Newest tool call of the current turn, in one line: the name of the tool, a colon, and its main argument, such as
   * `Bash: npm run typecheck` or `Read: C:/repo/src/app.ts`. At most 200 characters, cut with `…`. `null` while
   * `status` is not `working`, and when the agent made no tool call since its newest text message, since the log shows
   * that message already.
   */
  readonly latestAction: string | null;

  /**
   * Size of the context of the session in tokens: `input_tokens + cache_creation_input_tokens +
   * cache_read_input_tokens` of the usage of its newest model request in its transcript. `null` before its first model
   * request. Kept for an ended session, across restarts of the server.
   */
  readonly contextTokens: number | null;

  /**
   * Identifier of the model that answered the newest model request of the session, such as `claude-opus-5-5`. `null`
   * while it is not known. Kept for an ended session, across restarts of the server.
   */
  readonly model: string | null;

  /**
   * Reasoning effort of the newest model request of the session, such as `xhigh`. `null` while it is not known. Kept
   * for an ended session, across restarts of the server.
   */
  readonly effort: string | null;
}

/**
 * `Method` named `sessionList`, which returns the sessions of the repository: the attached ones first, then the
 * registered ones that are not attached, in the order of their start, each with its status, the start of its current
 * turn and its newest action, the task and the ticket that it works on, its job, its alias, the name of its chat, the
 * time of its latest message, the size of its context, and its model and effort. With `attached`, it returns only the
 * attached sessions or only the others.
 */
export const sessionListMethod: Method<typeof PARAMS, { readonly sessions: readonly ListedSession[] }> = {
  name: 'sessionList',
  description:
    'Returns the sessions and subagents of the repository, whether each one is attached, so messages can be delivered to it now, and whether its agent is idle, works, waits for the user, or has ended.',
  agent: false,
  params: PARAMS,
  handle: async ({ attached }, context) => {
    const registered = await context.sessions.list();
    const details = await detailsOf(registered, context);
    const live = attachedSessions(context).map((session) => ({
      ...session,
      ...details(session.sessionId, session.role),
    }));
    if (attached === true) return { sessions: live };
    const liveIds = new Set(live.map(({ sessionId }) => sessionId));
    const others = registered
      .filter(({ id }) => !liveIds.has(id))
      .map(({ id, role, parentId }) => ({
        sessionId: id,
        role,
        parentId,
        attached: false,
        status: 'ended' as const,
        turnStartedAt: null,
        latestAction: null,
        ...details(id, role),
      }));
    return { sessions: attached === false ? others : [...live, ...others] };
  },
};

/**
 * Fields of a listed session that the store and the message log hold, rather than the attachment.
 */
type SessionDetails = Pick<
  ListedSession,
  | 'taskId'
  | 'ticketId'
  | 'job'
  | 'alias'
  | 'name'
  | 'startedAt'
  | 'lastActivityAt'
  | 'contextTokens'
  | 'model'
  | 'effort'
>;

/**
 * Returns the function that returns the details of the session with an id and a role, among the registered sessions
 * `registered`, with the services of `context`. A session that is not registered works on no task, has no job, no
 * alias, no context size, no model and no effort, and has the name of its role.
 */
const detailsOf = async (
  registered: readonly RegisteredSession[],
  context: MethodContext,
): Promise<(sessionId: string, role: SessionRole) => SessionDetails> => {
  const names = await sessionNames(registered, context.tasks);
  const latest = await context.messageLog.latestTimes();
  const rows = new Map(registered.map((session) => [session.id, session]));
  return (sessionId, role) => {
    const row = rows.get(sessionId);
    const fallback = { id: sessionId, role, job: null, taskId: null, ticketId: null, alias: null };
    return {
      taskId: row?.taskId ?? null,
      ticketId: row?.ticketId ?? null,
      job: row?.job ?? null,
      alias: row?.alias ?? null,
      name: names.get(sessionId) ?? baseNameOf(fallback, undefined),
      startedAt: row?.startedAt ?? null,
      lastActivityAt: latest.get(sessionId) ?? null,
      contextTokens: row?.contextTokens ?? null,
      model: row?.model ?? null,
      effort: row?.effort ?? null,
    };
  };
};

/**
 * Returns the sessions that attached session servers serve now, with the services of `context`, in the order in which
 * they were bound, the latest last, followed by the attached subagents, in the order of their start, each with the
 * activity of its agent, without its details.
 */
const attachedSessions = ({
  sessionConnections,
  subagents,
  activity,
}: MethodContext): Omit<ListedSession, keyof SessionDetails>[] => [
  ...sessionConnections.list().map((sessionId) => ({
    sessionId,
    role: 'orchestrator' as const,
    parentId: null,
    attached: true,
    ...activityFields(activity.get(sessionId)),
  })),
  ...subagents.list().map(({ sessionId, parentId }) => ({
    sessionId,
    role: 'subagent' as const,
    parentId,
    attached: true,
    ...activityFields(activity.get(sessionId)),
  })),
];

/**
 * Returns the fields of a listed session that the activity `activity` of its agent sets. A session that has reported
 * no status is `idle`.
 */
const activityFields = (
  activity: Activity | undefined,
): Pick<ListedSession, 'status' | 'turnStartedAt' | 'latestAction'> =>
  activity ?? { status: 'idle', turnStartedAt: null, latestAction: null };
