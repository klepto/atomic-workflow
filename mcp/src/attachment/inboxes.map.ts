import type { CreateInboxesFunction, InboxDelivery, InboxMessage } from './inboxes.ts';

/**
 * Time in ms that a wait goes on after a message comes in, to take the messages that follow it with the same delivery.
 */
const BATCH_DELAY = 500;

/**
 * State of one open inbox.
 */
interface Inbox {
  /**
   * Identifier of the session that the inbox belongs to now.
   */
  sessionId: string;

  /**
   * Messages that the session has not acknowledged yet, the oldest first.
   */
  messages: InboxMessage[];

  /**
   * Number of the next message.
   */
  nextId: number;

  /**
   * Ends the wait of the session with `delivery`, or `undefined` while the session does not wait.
   */
  waiter: ((delivery: InboxDelivery) => void) | undefined;

  /**
   * Timer that ends the wait of the session with the messages that came in, or `undefined` while none runs.
   */
  batch: NodeJS.Timeout | undefined;
}

/**
 * Functions that each wait for an inbox to open, by the session that they wait for.
 */
type OpenListeners = Map<string, Set<() => void>>;

/**
 * Calls every function of `listeners` that waits for the session `sessionId`.
 */
const notifyOpen = (listeners: OpenListeners, sessionId: string): void => {
  for (const listener of listeners.get(sessionId) ?? []) listener();
};

/**
 * `CreateInboxesFunction` that keeps the inboxes in a map, by session.
 */
export const mapCreateInboxes: CreateInboxesFunction = () => {
  const inboxes = new Map<string, Inbox>();
  const listeners: OpenListeners = new Map();
  return {
    open: (sessionId, closed) => open(inboxes, listeners, sessionId, closed),
    move: (from, to) => move(inboxes, listeners, from, to),
    close: (sessionId) => close(inboxes, sessionId),
    find: (sessionId) => find(inboxes, sessionId),
    awaitOpen: (sessionId, timeout) => awaitOpen(inboxes, listeners, sessionId, timeout),
    deliver: (sessionId, content) => deliver(inboxes.get(sessionId), content),
    take: (sessionId, after) => take(inboxes.get(sessionId), after),
  };
};

/**
 * Opens an empty inbox for the session `sessionId` in `inboxes`, unless it has one, until `closed` resolves, and tells
 * `listeners`. A moved inbox closes with `closed` as well.
 */
const open = (
  inboxes: Map<string, Inbox>,
  listeners: OpenListeners,
  sessionId: string,
  closed: Promise<void>,
): void => {
  if (inboxes.has(sessionId)) return;
  const inbox: Inbox = { sessionId, messages: [], nextId: 1, waiter: undefined, batch: undefined };
  inboxes.set(sessionId, inbox);
  notifyOpen(listeners, sessionId);
  void closed.then(() => {
    if (inboxes.get(inbox.sessionId) === inbox) close(inboxes, inbox.sessionId);
  });
};

/**
 * Moves the inbox of the session `from` in `inboxes` to the session `to`, and tells `listeners`. If `to` has an inbox
 * already, closes the inbox of `from` instead.
 */
const move = (inboxes: Map<string, Inbox>, listeners: OpenListeners, from: string, to: string): void => {
  const inbox = inboxes.get(from);
  if (inbox === undefined || from === to) return;
  if (inboxes.has(to)) {
    close(inboxes, from);
    return;
  }
  inboxes.delete(from);
  inboxes.set(to, inbox);
  inbox.sessionId = to;
  notifyOpen(listeners, to);
};

/**
 * Removes the inbox of the session `sessionId` from `inboxes`, ends its wait with `stop`, and returns `true`. If
 * `inboxes` holds no such inbox, returns `false` instead.
 */
const close = (inboxes: Map<string, Inbox>, sessionId: string): boolean => {
  const inbox = inboxes.get(sessionId);
  if (inbox === undefined) return false;
  inboxes.delete(sessionId);
  clearTimeout(inbox.batch);
  inbox.waiter?.({ status: 'stop' });
  return true;
};

/**
 * Returns the session whose inbox in `inboxes` is open under `sessionId`, or under the only session id that begins
 * with `sessionId`. If there is no such session, returns `undefined` instead.
 */
const find = (inboxes: Map<string, Inbox>, sessionId: string): string | undefined => {
  if (inboxes.has(sessionId)) return sessionId;
  const matches = [...inboxes.keys()].filter((key) => key.startsWith(sessionId));
  return matches.length === 1 ? matches[0] : undefined;
};

/**
 * Returns `true` once `inboxes` holds an inbox of the session `sessionId`, which `listeners` tell. If none comes within
 * `timeout` ms, returns `false` instead.
 */
const awaitOpen = (
  inboxes: Map<string, Inbox>,
  listeners: OpenListeners,
  sessionId: string,
  timeout: number,
): Promise<boolean> => {
  if (inboxes.has(sessionId)) return Promise.resolve(true);
  const waiting = listeners.get(sessionId) ?? new Set();
  listeners.set(sessionId, waiting);
  return new Promise((resolve) => {
    const finish = (opened: boolean): void => {
      clearTimeout(timer);
      waiting.delete(onOpen);
      if (waiting.size === 0 && listeners.get(sessionId) === waiting) listeners.delete(sessionId);
      resolve(opened);
    };
    const onOpen = (): void => finish(true);
    const timer = setTimeout(() => finish(false), timeout);
    waiting.add(onOpen);
  });
};

/**
 * Adds the message `content` to `inbox`, ends its wait `BATCH_DELAY` ms later with every message that is not
 * acknowledged, and returns `true`. If `inbox` is `undefined`, returns `false` instead.
 */
const deliver = (inbox: Inbox | undefined, content: string): boolean => {
  if (inbox === undefined) return false;
  inbox.messages.push({ id: inbox.nextId, content });
  inbox.nextId += 1;
  inbox.batch ??= setTimeout(() => {
    inbox.batch = undefined;
    inbox.waiter?.(messages(inbox));
  }, BATCH_DELAY);
  return true;
};

/**
 * Drops the messages of `inbox` up to the number `after`, and returns the messages that are left. With none left,
 * waits for the next message, and ends the wait that was under way with `replaced`. If `inbox` is `undefined`,
 * returns `stop`.
 */
const take = (inbox: Inbox | undefined, after: number): Promise<InboxDelivery> => {
  if (inbox === undefined) return Promise.resolve({ status: 'stop' });
  inbox.messages = inbox.messages.filter((message) => message.id > after);
  inbox.waiter?.({ status: 'replaced' });
  // The messages that a running batch would end the wait with go out now, or wait for the next message.
  clearTimeout(inbox.batch);
  inbox.batch = undefined;
  if (inbox.messages.length > 0) return Promise.resolve(messages(inbox));
  return new Promise((resolve) => {
    const finish = (delivery: InboxDelivery): void => {
      if (inbox.waiter === finish) inbox.waiter = undefined;
      resolve(delivery);
    };
    inbox.waiter = finish;
  });
};

/**
 * Returns the delivery of the messages of `inbox` that are not acknowledged.
 */
const messages = (inbox: Inbox): InboxDelivery => {
  return { status: 'messages', sessionId: inbox.sessionId, messages: [...inbox.messages] };
};
