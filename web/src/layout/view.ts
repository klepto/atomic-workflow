import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, holdsAnySession, listChats } from '@/chats/chat-list.ts';
import { findChat, findTask, type Route, routePath, type TicketView, taskRefOf, ticketPath } from '@/routing/route.ts';

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
export interface View {
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
export interface ResolvedChat {
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
 * Result of `resolveView`.
 */
interface ViewResolution {
  /**
   * View that the route names.
   */
  readonly view: View;

  /**
   * Canonical path of the view, or `undefined` while the sessions or the tasks are not known.
   */
  readonly canonical: string | undefined;

  /**
   * Chat that the ref of the route resolved to, which the next resolution takes as `resolved`, or `undefined` while
   * the route names no chat that resolved.
   */
  readonly resolved: ResolvedChat | undefined;
}

/**
 * Resolves the route `route` against the sessions `sessions` and the tasks `tasks` into the view that it names, with
 * the canonical path of that view. A ticket of the open task opens in place of a chat, and keeps the ref of the route,
 * which the page of the ticket resolves. Until both the sessions and the tasks are known, nothing resolves, and the
 * canonical path is `undefined`. A ref of a chat that names no chat still names the chat that holds one of the
 * sessions of the chat that it resolved to last, `resolved`, so a chat that the server renames while it is open, such
 * as `plan` once its task exists and its session gets the alias `plan-<task slug>`, stays open, and its canonical path
 * takes its new name.
 */
export const resolveView = (
  route: Route,
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
  resolved: ResolvedChat | undefined,
): ViewResolution => {
  const known = sessions !== undefined && tasks !== undefined;
  const openTask = known && route.taskRef !== undefined ? findTask(tasks, route.taskRef) : undefined;
  const chats = known ? listChats(sessions, openTask?.id) : undefined;
  const named =
    chats !== undefined && route.chatRef !== undefined
      ? (findChat(chats, route.chatRef) ??
        (resolved?.ref === route.chatRef
          ? chats.find((chat) => holdsAnySession(chat, resolved.sessionIds))
          : undefined))
      : undefined;
  const ticket =
    openTask !== undefined && route.ticketRef !== undefined
      ? { ref: route.ticketRef, view: route.ticketView ?? 'summary' }
      : undefined;
  const open = ticket === undefined ? (named ?? chats?.[0]) : undefined;
  const canonical = !known
    ? undefined
    : openTask !== undefined && ticket !== undefined
      ? ticketPath(taskRefOf(openTask), ticket.ref, ticket.view)
      : routePath(openTask && taskRefOf(openTask), open?.ref);
  return {
    view: { openTask, chats, open, ticket },
    canonical,
    resolved:
      named === undefined || route.chatRef === undefined
        ? undefined
        : { ref: route.chatRef, sessionIds: named.sessionIds },
  };
};
