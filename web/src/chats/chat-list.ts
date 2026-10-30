import type { ListedSession } from '@/api/types.ts';

/**
 * Name and key of the one chat of every orchestrator session: the main session, which runs the atomic-workflow server.
 */
const MAIN = 'main';

/**
 * Words that the app shows for the chat of the main session.
 */
const MAIN_LABEL = 'main session';

/**
 * Job of the orchestrator of a task, and the ref of its chat in the view of its task.
 */
const TASK_ORCHESTRATOR = 'orchestrator';

/**
 * Status of a chat, as its dot shows it: `ended` while it has no attached session, and otherwise whether the agent of
 * its session is `idle`, `working`, or `waiting` for the user.
 */
export type ChatStatus = ListedSession['status'];

/**
 * Messages of a chat: the messages of one session, or of every session of a role.
 */
export type ChatLogQuery = { readonly sessionId: string } | { readonly role: ListedSession['role'] };

/**
 * Chat of the repository: the one chat of every orchestrator session, or the chat of one subagent.
 */
export interface Chat {
  /**
   * Key of the chat, which no other chat has: `main`, or the session id of a subagent.
   */
  readonly key: string;

  /**
   * Name of the chat, which no other chat has, and which names it in a URL in any view: `main`, or the name that the
   * server gives a subagent, such as `plan-cache-layer-redis` or `agent-5e6f7a8b`.
   */
  readonly name: string;

  /**
   * Words that the app shows for the chat: `main session`, or the name of a subagent.
   */
  readonly label: string;

  /**
   * Canonical ref of the chat in the URL of the view that lists it: `orchestrator` for the orchestrator of the open
   * task, and the name otherwise.
   */
  readonly ref: string;

  /**
   * Role of the sessions of the chat.
   */
  readonly role: ListedSession['role'];

  /**
   * Whether the chat is the orchestrator of the open task.
   */
  readonly taskOrchestrator: boolean;

  /**
   * Identifier of the attached session that takes the messages of the chat, or `undefined` while none is attached.
   */
  readonly sessionId: string | undefined;

  /**
   * Status of the chat.
   */
  readonly status: ChatStatus;

  /**
   * Time when the current turn of the session of the chat started, in ms since the epoch, or `null` while it runs no
   * turn.
   */
  readonly turnStartedAt: number | null;

  /**
   * Newest tool call of the current turn of the session of the chat, in one line, or `null` while it has none to show.
   */
  readonly latestAction: string | null;

  /**
   * Time when the current session of the chat started, in ms since the epoch, or `null` while it is not known.
   */
  readonly startedAt: number | null;

  /**
   * Time of the latest message of the current session of the chat, in ms since the epoch, or `null` for none.
   */
  readonly lastActivityAt: number | null;

  /**
   * Size of the context of the current session of the chat in tokens, or `null` before its first model request.
   */
  readonly contextTokens: number | null;

  /**
   * Model of the newest model request of the current session of the chat, such as `claude-opus-5-5`, or `null` while
   * it is not known.
   */
  readonly model: string | null;

  /**
   * Reasoning effort of the newest model request of the current session of the chat, such as `xhigh`, or `null` while
   * it is not known.
   */
  readonly effort: string | null;

  /**
   * Messages that the chat shows.
   */
  readonly logQuery: ChatLogQuery;
}

/**
 * Returns the session of `sessions` that started last. A session with no known start counts as the oldest. `sessions`
 * holds at least one session.
 */
const newestOf = (sessions: readonly ListedSession[]): ListedSession =>
  sessions.reduce((newest, session) => ((session.startedAt ?? 0) > (newest.startedAt ?? 0) ? session : newest));

/**
 * Returns the chat of every orchestrator session of `sessions`. It relies on the order of `sessions`, as `sessionList`
 * answers them: the attached sessions in the order in which they attached, the latest last. The chat sends to the
 * orchestrator session that attached last, the last attached one of `sessions`, and has its status and its turn. Its
 * current session is that session, else the one that started last, whose start, latest message, context size, model
 * and effort it has. If `sessions` holds no orchestrator session, returns `undefined` instead.
 */
const mainChat = (sessions: readonly ListedSession[]): Chat | undefined => {
  const orchestrators = sessions.filter((session) => session.role === 'orchestrator');
  if (orchestrators.length === 0) {
    return undefined;
  }
  const latest = orchestrators.findLast((session) => session.attached);
  const current = latest ?? newestOf(orchestrators);
  return {
    key: MAIN,
    name: MAIN,
    label: MAIN_LABEL,
    ref: MAIN,
    role: 'orchestrator',
    taskOrchestrator: false,
    sessionId: latest?.sessionId,
    status: latest?.status ?? 'ended',
    turnStartedAt: latest?.turnStartedAt ?? null,
    latestAction: latest?.latestAction ?? null,
    startedAt: current.startedAt,
    lastActivityAt: current.lastActivityAt,
    contextTokens: current.contextTokens,
    model: current.model,
    effort: current.effort,
    logQuery: { role: 'orchestrator' },
  };
};

/**
 * Returns the chat of the subagent `session`, the orchestrator of the open task when `taskOrchestrator` is true.
 */
const subagentChat = (session: ListedSession, taskOrchestrator: boolean): Chat => ({
  key: session.sessionId,
  name: session.name,
  label: session.name,
  ref: taskOrchestrator ? TASK_ORCHESTRATOR : session.name,
  role: 'subagent',
  taskOrchestrator,
  sessionId: session.attached ? session.sessionId : undefined,
  status: session.status,
  turnStartedAt: session.turnStartedAt,
  latestAction: session.latestAction,
  startedAt: session.startedAt,
  lastActivityAt: session.lastActivityAt,
  contextTokens: session.contextTokens,
  model: session.model,
  effort: session.effort,
  logQuery: { sessionId: session.sessionId },
});

/**
 * Returns the time of the last activity of the session `session`, in ms since the epoch: the time of its latest
 * message, else the time of its start, else 0.
 */
const activityOf = (session: ListedSession): number => session.lastActivityAt ?? session.startedAt ?? 0;

/**
 * Returns the orchestrator of the task `taskId` among the subagents `subagents`: the latest started one that is
 * attached, else the latest started one. If the task has none, returns `undefined` instead.
 */
const taskOrchestratorOf = (subagents: readonly ListedSession[], taskId: number): ListedSession | undefined => {
  const orchestrators = subagents
    .filter((session) => session.job === TASK_ORCHESTRATOR && session.taskId === taskId)
    .toSorted((first, second) => (second.startedAt ?? 0) - (first.startedAt ?? 0));
  return orchestrators.find((session) => session.attached) ?? orchestrators[0];
};

/**
 * Returns the chats of the sessions `sessions`, in the order in which `sessionList` answers them. The chat of the main
 * session comes first, while any orchestrator session is known. With `taskId`, the orchestrator of the task `taskId`
 * comes next, while it has one, then every other subagent that works on the task. Without it, every subagent comes
 * next. The subagents after the fixed chats are in the order of their last activity, the latest first, whether
 * attached or ended.
 */
export const listChats = (sessions: readonly ListedSession[], taskId?: number): readonly Chat[] => {
  const subagents = sessions.filter(
    (session) => session.role === 'subagent' && (taskId === undefined || session.taskId === taskId),
  );
  const main = mainChat(sessions);
  const orchestrator = taskId === undefined ? undefined : taskOrchestratorOf(subagents, taskId);
  const others = subagents
    .filter((session) => session !== orchestrator)
    .toSorted((first, second) => activityOf(second) - activityOf(first));
  return [
    ...(main === undefined ? [] : [main]),
    ...(orchestrator === undefined ? [] : [subagentChat(orchestrator, true)]),
    ...others.map((session) => subagentChat(session, false)),
  ];
};
