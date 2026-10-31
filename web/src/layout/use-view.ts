import { useEffect, useRef } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, holdsAnySession, listChats } from '@/chats/chat-list.ts';
import { currentPath, navigate } from '@/routing/navigation.ts';
import { findChat, findTask, routePath, type TicketView, taskRefOf, ticketPath } from '@/routing/route.ts';
import { useRoute } from '@/routing/use-route.ts';

/**
 * Ticket of the open task that the URL names.
 */
interface OpenTicket {
  /**
   * Ref of the ticket in the URL, which the page of the ticket resolves.
   */
  readonly ref: string;

  /**
   * View of the ticket that the URL names.
   */
  readonly view: TicketView;
}

/**
 * View that the URL names: the open task, the chats that the sidebar lists, the open chat and the open ticket. Each is
 * `undefined` until both the sessions and the tasks are known.
 */
interface View {
  /**
   * Task that the URL names, or `undefined` while it names none that exists.
   */
  readonly openTask: TaskSummary | undefined;

  /**
   * Chats of the open task, or of the repository while no task is open.
   */
  readonly chats: readonly Chat[] | undefined;

  /**
   * Chat that the URL names among `chats`, else the first of them, or `undefined` while there is none, or while a
   * ticket is open in its place.
   */
  readonly open: Chat | undefined;

  /**
   * Ticket of the open task that the URL names, or `undefined` while the URL names no ticket of an open task.
   */
  readonly ticket: OpenTicket | undefined;
}

/**
 * Chat that a ref of the URL resolved to last.
 */
interface ResolvedChat {
  /**
   * Ref of the URL.
   */
  readonly ref: string;

  /**
   * Identifiers of the sessions of the chat that the ref resolved to.
   */
  readonly sessionIds: readonly string[];
}

/**
 * Resolves the route of the URL against the sessions `sessions` and the tasks `tasks` into the view that it names, and
 * replaces the URL with the canonical path of that view, with no new history entry, whenever the two differ. A ticket
 * of the open task opens in place of a chat, and keeps the ref of the URL, which the page of the ticket resolves.
 * Until both the sessions and the tasks are known, nothing resolves and the URL stays as it is. A chat that the server
 * renames while it is open, such as `plan` once its task exists and its session gets the alias `plan-<task slug>`,
 * stays open: the ref that resolved to it last still names the chat that holds one of its sessions, and the URL then
 * takes its new name. Returns the view.
 */
export const useView = (
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
): View => {
  const route = useRoute();
  const known = sessions !== undefined && tasks !== undefined;
  const openTask = known && route.taskRef !== undefined ? findTask(tasks, route.taskRef) : undefined;
  const chats = known ? listChats(sessions, openTask?.id) : undefined;
  const resolved = useRef<ResolvedChat>(undefined);
  const named =
    chats !== undefined && route.chatRef !== undefined
      ? (findChat(chats, route.chatRef) ??
        (resolved.current?.ref === route.chatRef
          ? chats.find((chat) => holdsAnySession(chat, resolved.current?.sessionIds ?? []))
          : undefined))
      : undefined;
  const ticket =
    openTask !== undefined && route.ticketRef !== undefined
      ? { ref: route.ticketRef, view: route.ticketView ?? 'summary' }
      : undefined;
  const open = ticket === undefined ? (named ?? chats?.[0]) : undefined;
  useEffect(() => {
    resolved.current =
      named === undefined || route.chatRef === undefined
        ? undefined
        : { ref: route.chatRef, sessionIds: named.sessionIds };
  });
  const canonical = !known
    ? undefined
    : openTask !== undefined && ticket !== undefined
      ? ticketPath(taskRefOf(openTask), ticket.ref, ticket.view)
      : routePath(openTask && taskRefOf(openTask), open?.ref);
  // Runs again on each new route too, since back and forward can lead to a path that is not canonical.
  // biome-ignore lint/correctness/useExhaustiveDependencies: route reruns the effect on each navigation.
  useEffect(() => {
    if (canonical !== undefined && canonical !== currentPath()) {
      navigate(canonical, { replace: true });
    }
  }, [canonical, route]);
  return { openTask, chats, open, ticket };
};
