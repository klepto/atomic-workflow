import { useEffect, useState } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { navigate } from '@/routing/navigation.ts';
import { routePath, taskRefOf } from '@/routing/route.ts';

/**
 * Open chat as the last render saw it: its key, and the task id of its subagent.
 */
interface SeenChat {
  /**
   * Key of the open chat, or `undefined` while no chat is open.
   */
  readonly key: string | undefined;

  /**
   * Task id of the subagent of the open chat, or `null` while it has none or the open chat is not a subagent.
   */
  readonly taskId: number | null;
}

/**
 * Task to open once it is among the tasks, for the chat that stays open.
 */
interface PendingTask {
  /**
   * Key of the chat whose subagent got the task.
   */
  readonly key: string;

  /**
   * Id of the task to open.
   */
  readonly taskId: number;
}

/**
 * Opens the task of the open chat `open`, among the sessions `sessions` and the tasks `tasks`, when the subagent of
 * that chat gets its first task while its chat stays open, such as once it creates the task with its first goal. It
 * navigates as a click does, with a new history entry, once the task is among `tasks`, since the sessions can change
 * before the tasks do. A chat that already has a task when it opens does not open it.
 */
export const useFirstTaskOfOpenChat = (
  open: Chat | undefined,
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
): void => {
  const taskId =
    open?.role === 'subagent' ? (sessions?.find((session) => session.sessionId === open.key)?.taskId ?? null) : null;
  const [seen, setSeen] = useState<SeenChat>({ key: open?.key, taskId });
  const [pending, setPending] = useState<PendingTask>();
  if (seen.key !== open?.key || seen.taskId !== taskId) {
    setSeen({ key: open?.key, taskId });
    if (open !== undefined && seen.key === open.key && seen.taskId === null && taskId !== null) {
      setPending({ key: open.key, taskId });
    }
  }
  useEffect(() => {
    if (pending === undefined) {
      return;
    }
    if (open?.key !== pending.key) {
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
