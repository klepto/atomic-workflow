import type { TaskSummary } from '@/api/types.ts';
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
}

/**
 * The route of `/`: no task and no chat.
 */
const ROOT_ROUTE: Route = { taskRef: undefined, chatRef: undefined };

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
 * chat, a task, or both. A trailing slash is ignored, and each segment is decoded with `decodeURIComponent`. Any other
 * path, `/` among them, parses as no task and no chat.
 */
export const parseRoute = (pathname: string): Route => {
  const segments = segmentsOf(pathname);
  if (segments === undefined) {
    return ROOT_ROUTE;
  }
  const [first, second, third, fourth] = segments;
  if (segments.length === 2 && first === 'chat') {
    return { taskRef: undefined, chatRef: second };
  }
  if (segments.length === 2 && first === 'task') {
    return { taskRef: second, chatRef: undefined };
  }
  if (segments.length === 4 && first === 'task' && third === 'chat') {
    return { taskRef: second, chatRef: fourth };
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
 * Returns the canonical ref of the task `task`: `<id>-<slug>`, such as `3-url-routing-web`.
 */
export const taskRefOf = (task: TaskSummary): string => `${task.id}-${task.slug}`;

/**
 * Returns the canonical ref of the chat `chat`: its name, such as `orchestrator` or `agent-5e6f7a8b`.
 */
export const chatRefOf = (chat: Chat): string => chat.name;

/**
 * Returns the task of `tasks` that `ref` names, or `undefined` when none matches. `ref` matches the canonical ref
 * `<id>-<slug>` of a task first, then its id, then its slug.
 */
export const findTask = (tasks: readonly TaskSummary[], ref: string): TaskSummary | undefined =>
  tasks.find((task) => taskRefOf(task) === ref) ??
  tasks.find((task) => String(task.id) === ref) ??
  tasks.find((task) => task.slug === ref);

/**
 * Returns the chat of `chats` that `ref` names, or `undefined` when none matches. `ref` matches the name of a chat,
 * such as `agent-5e6f7a8b`, first, then its key, such as the full session id of a subagent.
 */
export const findChat = (chats: readonly Chat[], ref: string): Chat | undefined =>
  chats.find((chat) => chat.name === ref) ?? chats.find((chat) => chat.key === ref);
