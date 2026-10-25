import type { ListedSession } from '@/api/types.ts';

/**
 * The name of the chat of an orchestrator session itself.
 */
const ORCHESTRATOR = 'orchestrator';

/**
 * The number of characters of a session id that the sidebar shows, such as `1a2b3c4d`.
 */
const SHORT_ID_LENGTH = 8;

/**
 * The key of the group of the subagents whose orchestrator is not attached. No session id is this key.
 */
const OTHER_AGENTS = 'other-agents';

/**
 * A chat with an attached session: an orchestrator session or a subagent inside one.
 */
export interface Chat {
  /**
   * The id of the session of the chat.
   */
  sessionId: string;

  /**
   * The name of the chat: `orchestrator` for an orchestrator session, and `agent-` with the first 8 characters of its
   * session id for a subagent, such as `agent-5e6f7a8b`.
   */
  name: string;

  /**
   * The role of the session of the chat.
   */
  role: ListedSession['role'];

  /**
   * The id of the orchestrator session that a subagent runs inside, or `null` for an orchestrator session.
   */
  parentId: string | null;
}

/**
 * A group of chats under one heading: the chats of one attached orchestrator session, or the subagents whose
 * orchestrator is not attached.
 */
export interface ChatGroup {
  /**
   * The key of the group, which no other group of its list has: the id of its orchestrator session, or
   * `other-agents`.
   */
  key: string;

  /**
   * The heading of the group: `Session` for the chats of an orchestrator session, `Other agents` for the others.
   */
  label: 'Session' | 'Other agents';

  /**
   * The first 8 characters of the id of the orchestrator session of a `Session` group, or `undefined` for `Other
   * agents`.
   */
  shortId?: string;

  /**
   * The full id of the orchestrator session of a `Session` group, or `undefined` for `Other agents`.
   */
  orchestratorId?: string;

  /**
   * The chats of the group: the chat `orchestrator` first, then the subagents in the order of their start.
   */
  chats: readonly Chat[];
}

/**
 * Returns the first 8 characters of the session id `sessionId`.
 */
const shortIdOf = (sessionId: string) => sessionId.slice(0, SHORT_ID_LENGTH);

/**
 * Returns the chat of the session `session`.
 */
const chatOf = (session: ListedSession): Chat => ({
  sessionId: session.sessionId,
  name: session.role === 'orchestrator' ? ORCHESTRATOR : `agent-${shortIdOf(session.sessionId)}`,
  role: session.role,
  parentId: session.parentId,
});

/**
 * Returns the chats of the attached sessions `sessions`, as `sessionList` lists them, in groups. Each attached
 * orchestrator session has a group, the one that attached last first: its chat `orchestrator`, then its subagents in the
 * order of their start. The subagents whose orchestrator is not attached come last, in the group `Other agents`, which
 * is left out while it has no chat.
 */
export const groupChats = (sessions: readonly ListedSession[]): readonly ChatGroup[] => {
  const orchestrators = sessions.filter((session) => session.role === 'orchestrator');
  const attached = new Set(orchestrators.map((session) => session.sessionId));
  const subagents = sessions.filter((session) => session.role === 'subagent');
  const groups: ChatGroup[] = orchestrators.toReversed().map((orchestrator) => ({
    key: orchestrator.sessionId,
    label: 'Session',
    shortId: shortIdOf(orchestrator.sessionId),
    orchestratorId: orchestrator.sessionId,
    chats: [
      chatOf(orchestrator),
      ...subagents.filter((subagent) => subagent.parentId === orchestrator.sessionId).map(chatOf),
    ],
  }));
  const others = subagents.filter((subagent) => subagent.parentId === null || !attached.has(subagent.parentId));
  if (others.length > 0) {
    groups.push({ key: OTHER_AGENTS, label: 'Other agents', chats: others.map(chatOf) });
  }
  return groups;
};

/**
 * Returns the chats of every group of `groupChats(sessions)`, in the order of the groups.
 */
export const listChats = (sessions: readonly ListedSession[]): readonly Chat[] =>
  groupChats(sessions).flatMap((group) => group.chats);

/**
 * Returns the chat `orchestrator` of the orchestrator session of `sessions` that attached last, or `undefined` while
 * no orchestrator session is attached.
 */
export const defaultChat = (sessions: readonly ListedSession[]): Chat | undefined => {
  const latest = sessions.findLast((session) => session.role === 'orchestrator');
  return latest === undefined ? undefined : chatOf(latest);
};
