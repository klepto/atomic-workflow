import type { ListedSession } from '@/api/types.ts';

/**
 * Alias of every orchestrator session, and the name and key of their one chat: the chat of the main session, which runs
 * the atomic-workflow server.
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
 * Messages of a chat: the messages of one session, or of every session that holds an alias.
 */
export type ChatLogQuery = { readonly sessionId: string } | { readonly alias: string };

/**
 * Chat of the repository: the one chat of every session that holds an alias, such as `main` for every orchestrator
 * session, or the chat of one session with no alias.
 */
export interface Chat {
  /**
   * Key of the chat, which no other chat has: the alias of its sessions, such as `main`, or the session id of its one
   * session with no alias.
   */
  readonly key: string;

  /**
   * Name of the chat, which no other chat has, and which names it in a URL in any view: the alias of its sessions, such
   * as `main` or `plan-cache-layer-redis`, or the name that the server gives its one session, such as `agent-5e6f7a8b`.
   */
  readonly name: string;

  /**
   * Words that the app shows for the chat: `main session` for the chat `main`, and the name otherwise.
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
   * Identifiers of the sessions of the chat, at least one, in the order in which `sessionList` answers them.
   */
  readonly sessionIds: readonly string[];

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
 * Returns the time of the last activity of the session `session`, in ms since the epoch: the time of its latest
 * message, else the time of its start, else 0.
 */
const activityOf = (session: ListedSession): number => session.lastActivityAt ?? session.startedAt ?? 0;

/**
 * Returns the chat of the sessions `members`, which all hold the alias `alias`, or which are one session with no alias
 * while `alias` is `null`. It relies on the order of `members`, as `sessionList` answers them: the attached sessions in
 * the order in which they attached, the latest last. The chat sends to the session that attached last, and has its
 * status, its turn and its newest action. Its current session is that session, else the one that started last, whose
 * start, latest message, context size, model and effort it has. `members` holds at least one session.
 */
const chatOf = (alias: string | null, members: readonly ListedSession[]): Chat => {
  const latest = members.findLast((session) => session.attached);
  const current = latest ?? newestOf(members);
  const name = alias ?? current.name;
  return {
    key: alias ?? current.sessionId,
    name,
    label: alias === MAIN ? MAIN_LABEL : name,
    ref: name,
    role: current.role,
    sessionIds: members.map((session) => session.sessionId),
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
    logQuery: alias === null ? { sessionId: current.sessionId } : { alias },
  };
};

/**
 * Chat with the sessions it holds.
 */
interface Group {
  /**
   * Chat of the sessions.
   */
  readonly chat: Chat;

  /**
   * Sessions of the chat.
   */
  readonly members: readonly ListedSession[];
}

/**
 * Returns the chats of the sessions `sessions`, each with its sessions: one chat for each alias that a session holds,
 * in the order of the first session that holds it, and one chat for each session with no alias, in the order of
 * `sessions`.
 */
const groupsOf = (sessions: readonly ListedSession[]): readonly Group[] => {
  const groups = new Map<string, ListedSession[]>();
  for (const session of sessions) {
    const key = session.alias ?? session.sessionId;
    const members = groups.get(key);
    if (members === undefined) groups.set(key, [session]);
    else members.push(session);
  }
  return [...groups.values()].map((members) => ({ chat: chatOf(members[0]?.alias ?? null, members), members }));
};

/**
 * Returns the time of the last activity of the group `group`, in ms since the epoch: the latest last activity of its
 * sessions.
 */
const groupActivityOf = (group: Group): number => Math.max(...group.members.map(activityOf));

/**
 * Returns the orchestrator of the task `taskId` among the sessions `sessions`: the latest started session of the job
 * `orchestrator` on the task that is attached, else the latest started one. If the task has none, returns `undefined`
 * instead.
 */
const taskOrchestratorOf = (sessions: readonly ListedSession[], taskId: number): ListedSession | undefined => {
  const orchestrators = sessions
    .filter((session) => session.job === TASK_ORCHESTRATOR && session.taskId === taskId)
    .toSorted((first, second) => (second.startedAt ?? 0) - (first.startedAt ?? 0));
  return orchestrators.find((session) => session.attached) ?? orchestrators[0];
};

/**
 * Returns whether the chat `chat` holds a session of `sessionIds`. A chat that keeps a session stays the same chat even
 * when its key and its name change, such as once its session gets an alias.
 */
export const holdsAnySession = (chat: Chat, sessionIds: readonly string[]): boolean =>
  chat.sessionIds.some((sessionId) => sessionIds.includes(sessionId));

/**
 * Returns the chats of the sessions `sessions`, one for each alias and one for each session with no alias. The chat
 * `main`, of every orchestrator session, comes first while it is known. With `taskId`, the chat that holds the
 * orchestrator of the task `taskId` comes next, with the ref `orchestrator`, while the task has one, then every other
 * chat that holds a session of the task. Without it, every other chat comes next. The chats after the fixed ones are
 * in the order of their last activity, the latest first, whether attached or ended.
 */
export const listChats = (sessions: readonly ListedSession[], taskId?: number): readonly Chat[] => {
  const groups = groupsOf(sessions);
  const main = groups.find((group) => group.chat.key === MAIN);
  const orchestratorSession = taskId === undefined ? undefined : taskOrchestratorOf(sessions, taskId);
  const orchestrator =
    orchestratorSession === undefined ? undefined : groups.find((group) => group.members.includes(orchestratorSession));
  const others = groups
    .filter(
      (group) =>
        group !== main &&
        group !== orchestrator &&
        (taskId === undefined || group.members.some((session) => session.taskId === taskId)),
    )
    .toSorted((first, second) => groupActivityOf(second) - groupActivityOf(first));
  return [
    ...(main === undefined ? [] : [main.chat]),
    ...(orchestrator === undefined ? [] : [{ ...orchestrator.chat, ref: TASK_ORCHESTRATOR, taskOrchestrator: true }]),
    ...others.map((group) => group.chat),
  ];
};
