import type { ListedSession } from '@/api/types.ts';

/**
 * The name and the key of the one chat of every orchestrator session: the main session, which runs the
 * atomic-workflow server.
 */
export const MAIN = 'main';

/**
 * The words that the app shows for the chat of the main session.
 */
const MAIN_LABEL = 'main session';

/**
 * The job of the orchestrator of a task, and the ref of its chat in the view of its task.
 */
export const TASK_ORCHESTRATOR = 'orchestrator';

/**
 * The status of a chat, as its dot shows it: `ended` while it has no attached session, and otherwise whether the agent
 * of its session is `idle`, `working`, or `waiting` for the user.
 */
export type ChatStatus = ListedSession['status'];

/**
 * The messages of a chat: the messages of one session, or of every session of a role.
 */
export type ChatLogQuery = { sessionId: string } | { role: ListedSession['role'] };

/**
 * A chat of the repository: the one chat of every orchestrator session, or the chat of one subagent.
 */
export interface Chat {
  /**
   * The key of the chat, which no other chat has: `main`, or the session id of a subagent.
   */
  key: string;

  /**
   * The name of the chat, which no other chat has, and which names it in a URL in any view: `main`, or the name that
   * the server gives a subagent, such as `plan-cache-layer-redis` or `agent-5e6f7a8b`.
   */
  name: string;

  /**
   * The words that the app shows for the chat: `main session`, or the name of a subagent.
   */
  label: string;

  /**
   * The canonical ref of the chat in the URL of the view that lists it: `orchestrator` for the orchestrator of the open
   * task, and the name otherwise.
   */
  ref: string;

  /**
   * The role of the sessions of the chat.
   */
  role: ListedSession['role'];

  /**
   * Whether the chat is the orchestrator of the open task.
   */
  taskOrchestrator: boolean;

  /**
   * The id of the attached session that takes the messages of the chat, or `undefined` while none is attached.
   */
  sessionId: string | undefined;

  /**
   * The status of the chat.
   */
  status: ChatStatus;

  /**
   * The time when the current turn of the session of the chat started, in ms since the epoch, or `null` while it runs
   * no turn.
   */
  turnStartedAt: number | null;

  /**
   * The newest tool call of the current turn of the session of the chat, in one line, or `null` while it has none to
   * show.
   */
  latestAction: string | null;

  /**
   * The time when the current session of the chat started, in ms since the epoch, or `null` while it is not known.
   */
  startedAt: number | null;

  /**
   * The time of the latest message of the current session of the chat, in ms since the epoch, or `null` for none.
   */
  lastActivityAt: number | null;

  /**
   * The size of the context of the current session of the chat in tokens, or `null` before its first model request.
   */
  contextTokens: number | null;

  /**
   * The model of the newest model request of the current session of the chat, such as `claude-opus-5-5`, or `null`
   * while it is not known.
   */
  model: string | null;

  /**
   * The reasoning effort of the newest model request of the current session of the chat, such as `xhigh`, or `null`
   * while it is not known.
   */
  effort: string | null;

  /**
   * The messages that the chat shows.
   */
  logQuery: ChatLogQuery;
}

/**
 * Returns the chat of every orchestrator session of `sessions`. It sends to the orchestrator session that attached
 * last, and has its status and its turn. Its current session is that session, else the one that started last, whose
 * start, latest message, context size, model and effort it has. Returns `undefined` when `sessions` holds no
 * orchestrator session.
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
 * Returns the session of `sessions` that started last. A session with no known start counts as the oldest.
 * `sessions` holds at least one session.
 */
const newestOf = (sessions: readonly ListedSession[]): ListedSession =>
  sessions.reduce((newest, session) => ((session.startedAt ?? 0) > (newest.startedAt ?? 0) ? session : newest));

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
 * Returns the time of the last activity of the session `session`: the time of its latest message, else the time of
 * its start.
 */
const activityOf = (session: ListedSession) => session.lastActivityAt ?? session.startedAt ?? 0;

/**
 * Returns the orchestrator of the task `taskId` among the subagents `subagents`: the latest started one that is
 * attached, else the latest started one. Returns `undefined` while the task has none.
 */
const taskOrchestratorOf = (subagents: readonly ListedSession[], taskId: number): ListedSession | undefined => {
  const orchestrators = subagents
    .filter((session) => session.job === TASK_ORCHESTRATOR && session.taskId === taskId)
    .toSorted((first, second) => (second.startedAt ?? 0) - (first.startedAt ?? 0));
  return orchestrators.find((session) => session.attached) ?? orchestrators[0];
};

/**
 * Returns the chats of the sessions `sessions`. The chat of the main session comes first, while any orchestrator
 * session is known. With `taskId`, the orchestrator of the task `taskId` comes next, while it has one, then every
 * other subagent that works on the task. Without it, every subagent comes next. The subagents after the fixed chats
 * are in the order of their last activity, the latest first, whether attached or ended.
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
