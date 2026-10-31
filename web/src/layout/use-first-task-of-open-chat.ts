import { useEffect, useState } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, holdsAnySession } from '@/chats/chat-list.ts';
import { navigate } from '@/routing/navigation.ts';
import { routePath, taskRefOf } from '@/routing/route.ts';

/**
 * Open chat as the last render saw it: the identifiers of its sessions, and the task id of its subagents.
 */
interface SeenChat {
  /**
   * Identifiers of the sessions of the open chat, empty while no chat is open.
   */
  readonly sessionIds: readonly string[];

  /**
   * Task id of the subagents of the open chat, or `null` while they have none or the open chat is not of subagents.
   */
  readonly taskId: number | null;
}

/**
 * Task to open once it is among the tasks, for the chat that stays open.
 */
interface PendingTask {
  /**
   * Identifiers of the sessions of the chat whose subagent got the task.
   */
  readonly sessionIds: readonly string[];

  /**
   * Id of the task to open.
   */
  readonly taskId: number;
}

/**
 * Opens the task of the open chat `open`, among the sessions `sessions` and the tasks `tasks`, when the subagents of
 * that chat get their first task while the chat stays open, such as once one creates the task with its first goal. It
 * navigates as a click does, with a new history entry, once the task is among `tasks`, since the sessions can change
 * before the tasks do. A chat that already has a task when it opens does not open it.
 */
export const useFirstTaskOfOpenChat = (
  open: Chat | undefined,
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
): void => {
  const taskId =
    open?.role === 'subagent'
      ? (sessions?.find((session) => open.sessionIds.includes(session.sessionId) && session.taskId !== null)?.taskId ??
        null)
      : null;
  const sessionIds = open?.sessionIds ?? [];
  const [seen, setSeen] = useState<SeenChat>({ sessionIds, taskId });
  const [pending, setPending] = useState<PendingTask>();
  const same = open === undefined ? seen.sessionIds.length === 0 : holdsAnySession(open, seen.sessionIds);
  // The seen sessions follow the sessions that join the chat, so that the chat stays the same once its first ones go.
  if (!same || seen.sessionIds.length !== sessionIds.length || seen.taskId !== taskId) {
    setSeen({ sessionIds, taskId });
    if (open !== undefined && same && seen.taskId === null && taskId !== null) {
      setPending({ sessionIds, taskId });
    }
  }
  useEffect(() => {
    if (pending === undefined) {
      return;
    }
    if (open === undefined || !holdsAnySession(open, pending.sessionIds)) {
      setPending(undefined);
      return;
    }
    const task = tasks?.find((candidate) => candidate.id === pending.taskId);
    if (task === undefined) {
      return;
    }
    setPending(undefined);
    navigate(routePath(taskRefOf(task), open.name));
  }, [pending, open, tasks]);
};
