import type { TaskSummary, Ticket } from '@/api/types.ts';

/**
 * View of a ticket: `summary` for its description and its status, `review` for the review of its changes.
 */
export type TicketView = 'summary' | 'review';

/**
 * Item that a ref of a path names by its canonical ref `<id>-<slug>`, its id or its slug, such as a task or a ticket.
 */
interface RefItem {
  /**
   * Identifier of the item.
   */
  readonly id: number;

  /**
   * Short name of the item in kebab case.
   */
  readonly slug: string;
}

/**
 * Chat that a ref of a path names, by the names of `Chat` of `web/src/chats/chat-list.ts`.
 */
interface RefChat {
  /**
   * Canonical ref of the chat in the view that lists it, such as `main` or `orchestrator`.
   */
  readonly ref: string;

  /**
   * Name of the chat, such as `orchestrator-cache-layer-redis`, which every view finds.
   */
  readonly name: string;

  /**
   * Key of the chat, such as `main` or the full session id of a session with no alias.
   */
  readonly key: string;

  /**
   * Identifiers of the sessions of the chat.
   */
  readonly sessionIds: readonly string[];
}

/**
 * Parsed path. Each ref is the raw decoded segment, or `undefined` when the path has none.
 */
export interface Route {
  /**
   * Segment that names the open task, such as `3-url-routing-web`, or `undefined` when no task is open.
   */
  readonly taskRef: string | undefined;

  /**
   * Segment that names the open chat, such as `agent-5e6f7a8b`, or `undefined` when the path names no chat.
   */
  readonly chatRef: string | undefined;

  /**
   * Segment that names the open ticket of the open task, such as `2-diff-view-page`, or `undefined` when the path
   * names no ticket.
   */
  readonly ticketRef: string | undefined;

  /**
   * View of the open ticket: `summary` for its description and its status, `review` for the review of its changes,
   * or `undefined` when the path names no ticket.
   */
  readonly ticketView: TicketView | undefined;
}

/**
 * Route of `/`: no task, no chat and no ticket.
 */
const ROOT_ROUTE: Route = { taskRef: undefined, chatRef: undefined, ticketRef: undefined, ticketView: undefined };

/**
 * Last segment of the path of the review of a ticket.
 */
const REVIEW_SEGMENT = 'review';

/**
 * Returns the decoded segments of `pathname`, without its leading slash and its trailing slash, or `undefined` when a
 * segment is empty or does not decode.
 */
const segmentsOf = (pathname: string): readonly string[] | undefined => {
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
 * Returns the canonical ref of the item `item`: `<id>-<slug>`.
 */
const refOf = (item: RefItem): string => `${item.id}-${item.slug}`;

/**
 * Returns the item of `items` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of an item first, then its id, then its slug.
 */
const findByRef = <Item extends RefItem>(items: readonly Item[], ref: string): Item | undefined =>
  items.find((item) => refOf(item) === ref) ??
  items.find((item) => String(item.id) === ref) ??
  items.find((item) => item.slug === ref);

/**
 * Returns the canonical ref of the ticket `ticket`: `<id>-<slug>`, such as `2-diff-view-page`.
 */
export const ticketRefOf = (ticket: Ticket): string => refOf(ticket);

/**
 * Returns the ticket of `tickets` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of a ticket first, then its id, then its slug.
 */
export const findTicket = (tickets: readonly Ticket[], ref: string): Ticket | undefined => findByRef(tickets, ref);

/**
 * Returns the canonical ref of the task `task`: `<id>-<slug>`, such as `3-url-routing-web`.
 */
export const taskRefOf = (task: TaskSummary): string => refOf(task);

/**
 * Returns the task of `tasks` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of a task first, then its id, then its slug.
 */
export const findTask = (tasks: readonly TaskSummary[], ref: string): TaskSummary | undefined => findByRef(tasks, ref);

/**
 * Returns the chat of `chats` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref of a
 * chat in its view, such as `orchestrator`, first, then its name, such as `orchestrator-cache-layer-redis`, then its
 * key, then the full session id of any of its sessions.
 */
export const findChat = <Chat extends RefChat>(chats: readonly Chat[], ref: string): Chat | undefined =>
  chats.find((chat) => chat.ref === ref) ??
  chats.find((chat) => chat.name === ref) ??
  chats.find((chat) => chat.key === ref) ??
  chats.find((chat) => chat.sessionIds.includes(ref));
