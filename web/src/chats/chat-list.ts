import type { ListedSession } from '@/api/types.ts';

/**
 * The name and the key of the one chat of every orchestrator session.
 */
export const ORCHESTRATOR = 'orchestrator';

/**
 * The number of characters of a session id that the sidebar shows, such as `1a2b3c4d`.
 */
const SHORT_ID_LENGTH = 8;

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
   * The key of the chat, which no other chat has: `orchestrator`, or the session id of a subagent.
   */
  key: string;

  /**
   * The name of the chat: `orchestrator`, or `agent-` with the first 8 characters of the session id of a subagent, such
   * as `agent-5e6f7a8b`.
   */
  name: string;

  /**
   * The role of the sessions of the chat.
   */
  role: ListedSession['role'];

  /**
   * The id of the attached session that takes the messages of the chat, or `undefined` while none is attached.
   */
  sessionId: string | undefined;

  /**
   * The status of the chat.
   */
  status: ChatStatus;

  /**
   * The messages that the chat shows.
   */
  logQuery: ChatLogQuery;
}

/**
 * Returns the first 8 characters of the session id `sessionId`.
 */
const shortIdOf = (sessionId: string) => sessionId.slice(0, SHORT_ID_LENGTH);

/**
 * Returns the chat of every orchestrator session of `sessions`. It sends to the orchestrator session that attached
 * last, and has its status. Returns `undefined` when `sessions` holds no orchestrator session.
 */
const orchestratorChat = (sessions: readonly ListedSession[]): Chat | undefined => {
  const orchestrators = sessions.filter((session) => session.role === 'orchestrator');
  if (orchestrators.length === 0) {
    return undefined;
  }
  const latest = orchestrators.findLast((session) => session.attached);
  return {
    key: ORCHESTRATOR,
    name: ORCHESTRATOR,
    role: 'orchestrator',
    sessionId: latest?.sessionId,
    status: latest?.status ?? 'ended',
    logQuery: { role: 'orchestrator' },
  };
};

/**
 * Returns the chat of the subagent `session`.
 */
const subagentChat = (session: ListedSession): Chat => ({
  key: session.sessionId,
  name: `agent-${shortIdOf(session.sessionId)}`,
  role: 'subagent',
  sessionId: session.attached ? session.sessionId : undefined,
  status: session.status,
  logQuery: { sessionId: session.sessionId },
});

/**
 * Returns the chats of the sessions `sessions`, as `sessionList` lists them: the chat `orchestrator` first, while any
 * orchestrator session is known, then the subagents that are attached, the latest started first, then the subagents
 * that ended, the latest started first. With `taskId`, only the subagents that work on the task `taskId` are listed,
 * after the chat `orchestrator`.
 */
export const listChats = (sessions: readonly ListedSession[], taskId?: number): readonly Chat[] => {
  const subagents = sessions
    .filter((session) => session.role === 'subagent' && (taskId === undefined || session.taskId === taskId))
    .toReversed();
  const orchestrator = orchestratorChat(sessions);
  return [
    ...(orchestrator === undefined ? [] : [orchestrator]),
    ...subagents.filter((session) => session.attached).map(subagentChat),
    ...subagents.filter((session) => !session.attached).map(subagentChat),
  ];
};
