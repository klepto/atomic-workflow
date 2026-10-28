import type { TaskSummary, Ticket } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';

/**
 * A parsed path. Each ref is the raw decoded segment, or undefined when the path has none.
 */
export interface Route {
  /**
   * The segment that names the open task, such as `3-url-routing-web`, or `undefined` when no task is open.
   */
  taskRef: string | undefined;

  /**
   * The segment that names the open chat, such as `agent-5e6f7a8b`, or `undefined` when the path names no chat.
   */
  chatRef: string | undefined;

  /**
   * The segment that names the open ticket of the open task, such as `2-diff-view-page`, or `undefined` when the path
   * names no ticket.
   */
  ticketRef: string | undefined;

  /**
   * The view of the open ticket: `summary` for its description and its status, `review` for the review of its changes,
   * or `undefined` when the path names no ticket.
   */
  ticketView: TicketView | undefined;
}

/**
 * A view of a ticket: `summary` for its description and its status, `review` for the review of its changes.
 */
export type TicketView = 'summary' | 'review';

/**
 * The route of `/`: no task, no chat and no ticket.
 */
const ROOT_ROUTE: Route = { taskRef: undefined, chatRef: undefined, ticketRef: undefined, ticketView: undefined };

/**
 * The last segment of the path of the review of a ticket.
 */
const REVIEW_SEGMENT = 'review';

/**
 * Returns the decoded segments of `pathname`, without its leading slash and its trailing slash, or `undefined` when a
 * segment is empty or does not decode.
 */
const segmentsOf = (pathname: string): string[] | undefined => {
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (!trimmed.startsWith('/')) {
    return undefined;
  }
  const segments = trimmed.slice(1).split('/');
  if (segments.some((segment) => segment === '')) {
    return undefined;
  }
  try {
    return segments.map(decodeURIComponent);
  } catch {
    return undefined;
  }
};

/**
 * Parses a path, such as `location.pathname`. `/chat/<chat>`, `/task/<task>` and `/task/<task>/chat/<chat>` name a
 * chat, a task, or both. `/task/<task>/<ticket>` names the summary of a ticket of the task, and
 * `/task/<task>/<ticket>/review` its review. A trailing slash is ignored, and each segment is decoded with
 * `decodeURIComponent`. Any other path, `/` among them, parses as no task and no chat.
 */
export const parseRoute = (pathname: string): Route => {
  const segments = segmentsOf(pathname);
  if (segments === undefined) {
    return ROOT_ROUTE;
  }
  const [first, second, third, fourth] = segments;
  if (segments.length === 2 && first === 'chat') {
    return { ...ROOT_ROUTE, chatRef: second };
  }
  if (first !== 'task') {
    return ROOT_ROUTE;
  }
  if (segments.length === 2) {
    return { ...ROOT_ROUTE, taskRef: second };
  }
  if (segments.length === 4 && third === 'chat') {
    return { ...ROOT_ROUTE, taskRef: second, chatRef: fourth };
  }
  if (segments.length === 3 && third !== 'chat') {
    return { ...ROOT_ROUTE, taskRef: second, ticketRef: third, ticketView: 'summary' };
  }
  if (segments.length === 4 && fourth === REVIEW_SEGMENT) {
    return { ...ROOT_ROUTE, taskRef: second, ticketRef: third, ticketView: 'review' };
  }
  return ROOT_ROUTE;
};

/**
 * Formats the path of the task `taskRef` and the chat `chatRef`, the inverse of `parseRoute`, with each segment encoded
 * with `encodeURIComponent`. With no task ref and no chat ref, returns `/`.
 */
export const routePath = (taskRef: string | undefined, chatRef: string | undefined): string => {
  const task = taskRef === undefined ? '' : `/task/${encodeURIComponent(taskRef)}`;
  const chat = chatRef === undefined ? '' : `/chat/${encodeURIComponent(chatRef)}`;
  return task + chat || '/';
};

/**
 * Formats the path of the view `view` of the ticket `ticketRef` of the task `taskRef`, the inverse of `parseRoute`,
 * with each segment encoded with `encodeURIComponent`.
 */
export const ticketPath = (taskRef: string, ticketRef: string, view: TicketView): string => {
  const ticket = `/task/${encodeURIComponent(taskRef)}/${encodeURIComponent(ticketRef)}`;
  return view === 'review' ? `${ticket}/${REVIEW_SEGMENT}` : ticket;
};

/**
 * Returns the canonical ref of the ticket `ticket`: `<id>-<slug>`, such as `2-diff-view-page`.
 */
export const ticketRefOf = (ticket: Ticket): string => `${ticket.id}-${ticket.slug}`;

/**
 * Returns the ticket of `tickets` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of a ticket first, then its id, then its slug.
 */
export const findTicket = (tickets: readonly Ticket[], ref: string): Ticket | undefined =>
  tickets.find((ticket) => ticketRefOf(ticket) === ref) ??
  tickets.find((ticket) => String(ticket.id) === ref) ??
  tickets.find((ticket) => ticket.slug === ref);

/**
 * Returns the canonical ref of the task `task`: `<id>-<slug>`, such as `3-url-routing-web`.
 */
export const taskRefOf = (task: TaskSummary): string => `${task.id}-${task.slug}`;

/**
 * Returns the canonical ref of the chat `chat` in the view that lists it, such as `main`, `orchestrator` for the
 * orchestrator of the open task, or `implement-cache-key-format`. A path to another view names the chat by its name,
 * which every view finds.
 */
export const chatRefOf = (chat: Chat): string => chat.ref;

/**
 * Returns the task of `tasks` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of a task first, then its id, then its slug.
 */
export const findTask = (tasks: readonly TaskSummary[], ref: string): TaskSummary | undefined =>
  tasks.find((task) => taskRefOf(task) === ref) ??
  tasks.find((task) => String(task.id) === ref) ??
  tasks.find((task) => task.slug === ref);

/**
 * Returns the chat of `chats` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref of a
 * chat in its view, such as `orchestrator`, first, then its name, such as `orchestrator-cache-layer-redis`, then its
 * key, such as the full session id of a subagent.
 */
export const findChat = (chats: readonly Chat[], ref: string): Chat | undefined =>
  chats.find((chat) => chat.ref === ref) ??
  chats.find((chat) => chat.name === ref) ??
  chats.find((chat) => chat.key === ref);
