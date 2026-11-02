import type { PermissionPrompts } from '../attachment/permission-prompts.ts';
import type { SessionActivity } from '../attachment/session-activity.ts';
import type { SessionConnections } from '../attachment/session-connections.ts';
import type { Subagents } from '../attachment/subagents.ts';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import type { TaskStore } from '../storage/task-store.ts';
import type { ChangedResource, ChangeFeed } from './change-feed.ts';
import type { PublishChangesFunction } from './publish-changes.ts';

/**
 * `PublishChangesFunction` that wraps each service in an object that calls the service, and publishes to the feed
 * around the calls that change its state.
 */
export const feedPublishChanges: PublishChangesFunction = (services, changes) => ({
  messageLog: publishingMessageLog(services.messageLog, changes),
  tasks: publishingTasks(services.tasks, changes),
  sessions: publishingSessions(services.sessions, changes),
  sessionConnections: publishingSessionConnections(services.sessionConnections, changes),
  subagents: publishingSubagents(services.subagents, changes),
  activity: publishingActivity(services.activity, changes),
  prompts: publishingPrompts(services.prompts, changes),
});

/**
 * Returns the result of `write`, and publishes `resource` to `changes` once `write` resolves. A write that rejects
 * publishes nothing.
 */
const published = async <T>(write: Promise<T>, changes: ChangeFeed, resource: ChangedResource): Promise<T> =>
  publishedIf(write, changes, resource, () => true);

/**
 * Returns the result of `write`, and publishes `resource` to `changes` once `write` resolves with a result for which
 * `changed` returns `true`. A write that rejects publishes nothing.
 */
const publishedIf = async <T>(
  write: Promise<T>,
  changes: ChangeFeed,
  resource: ChangedResource,
  changed: (result: T) => boolean,
): Promise<T> => {
  const result = await write;
  if (changed(result)) changes.publish(resource);
  return result;
};

/**
 * Returns whether a write that resolved with `result` changed something: `true` for a write that returns whether it
 * changed something.
 */
const isChange = (result: boolean): boolean => result;

/**
 * Returns whether a write that resolved with the count `count` changed something: a count above 0.
 */
const isCount = (count: number): boolean => count > 0;

/**
 * Wraps `store`, so that `append` publishes `messages` to `changes` once it resolves, and `deleteSession` once it
 * resolves with a deleted message.
 */
const publishingMessageLog = (store: MessageLogStore, changes: ChangeFeed): MessageLogStore => ({
  append: (message) => published(store.append(message), changes, 'messages'),
  list: (query) => store.list(query),
  deleteSession: (sessionId) => publishedIf(store.deleteSession(sessionId), changes, 'messages', isCount),
  latestTimes: () => store.latestTimes(),
});

/**
 * Wraps `store`, so that each write publishes `tasks` to `changes` once it resolves, and `startRun`, `endRun` and
 * `endRuns` publish `tasks` only once they resolve with a change.
 */
const publishingTasks = (store: TaskStore, changes: ChangeFeed): TaskStore => {
  const write = <T>(result: Promise<T>): Promise<T> => published(result, changes, 'tasks');
  return {
    create: (task) => write(store.create(task)),
    get: (id) => store.get(id),
    list: () => store.list(),
    delete: (id) => write(store.delete(id)),
    addGoal: (taskId, goal) => write(store.addGoal(taskId, goal)),
    editGoal: (taskId, goalId, text) => write(store.editGoal(taskId, goalId, text)),
    deleteGoal: (taskId, goalId) => write(store.deleteGoal(taskId, goalId)),
    setDesign: (taskId, design) => write(store.setDesign(taskId, design)),
    setTickets: (taskId, tickets) => write(store.setTickets(taskId, tickets)),
    setStatus: (taskId, status) => write(store.setStatus(taskId, status)),
    setBaseBranch: (taskId, branch) => write(store.setBaseBranch(taskId, branch)),
    setTicketProgress: (taskId, ticketId, progress) => write(store.setTicketProgress(taskId, ticketId, progress)),
    startRun: (taskId, at) => publishedIf(store.startRun(taskId, at), changes, 'tasks', isChange),
    endRun: (taskId, at, startedAt) => publishedIf(store.endRun(taskId, at, startedAt), changes, 'tasks', isChange),
    endRuns: (at) => publishedIf(store.endRuns(at), changes, 'tasks', isCount),
  };
};

/**
 * Wraps `store`, so that `setTask`, `moveTask`, `setTicket`, `setAlias` and `setUsage` publish `sessions` to
 * `changes` once they resolve with `true`, and `delete` publishes `sessions` and `messages` once it resolves with
 * `true`.
 */
const publishingSessions = (store: SessionStore, changes: ChangeFeed): SessionStore => {
  const write = (result: Promise<boolean>): Promise<boolean> => publishedIf(result, changes, 'sessions', isChange);
  return {
    register: (session) => store.register(session),
    get: (id) => store.get(id),
    list: () => store.list(),
    setTask: (id, taskId) => write(store.setTask(id, taskId)),
    moveTask: (id, taskId) => write(store.moveTask(id, taskId)),
    setTicket: (id, ticketId) => write(store.setTicket(id, ticketId)),
    setAlias: (id, alias) => write(store.setAlias(id, alias)),
    setUsage: (id, usage) => write(store.setUsage(id, usage)),
    delete: async (id) => {
      const deleted = await store.delete(id);
      if (deleted) {
        changes.publish('sessions');
        changes.publish('messages');
      }
      return deleted;
    },
  };
};

/**
 * Wraps `connections`, so that `bind` publishes `sessions` to `changes`, and again once the bound connection closes.
 */
const publishingSessionConnections = (connections: SessionConnections, changes: ChangeFeed): SessionConnections => ({
  bind: (sessionId, connection) => {
    const previous = connections.bind(sessionId, connection);
    changes.publish('sessions');
    void connection.closed.then(() => changes.publish('sessions'));
    return previous;
  },
  get: (sessionId) => connections.get(sessionId),
  list: () => connections.list(),
});

/**
 * Wraps `subagents`, so that `attach` and `stop` publish `sessions` to `changes`, and `start` publishes `sessions` once
 * its connection closes, since that stops the subagent.
 */
const publishingSubagents = (subagents: Subagents, changes: ChangeFeed): Subagents => ({
  start: (sessionId, parentId, connection) => {
    subagents.start(sessionId, parentId, connection);
    void connection.closed.then(() => changes.publish('sessions'));
  },
  waitForAttach: (sessionId, signal) => subagents.waitForAttach(sessionId, signal),
  attach: (sessionId) => {
    subagents.attach(sessionId);
    changes.publish('sessions');
  },
  stop: (sessionId) => {
    const stopped = subagents.stop(sessionId);
    changes.publish('sessions');
    return stopped;
  },
  list: () => subagents.list(),
});

/**
 * Wraps `activity`, so that `report`, `reportAction` and `forget` publish `sessions` to `changes` when the activity
 * changes.
 */
const publishingActivity = (activity: SessionActivity, changes: ChangeFeed): SessionActivity => {
  const write = (changed: boolean): boolean => {
    if (changed) changes.publish('sessions');
    return changed;
  };
  return {
    report: (sessionId, status, at) => write(activity.report(sessionId, status, at)),
    reportAction: (sessionId, action, at) => write(activity.reportAction(sessionId, action, at)),
    forget: (sessionId) => write(activity.forget(sessionId)),
    get: (sessionId) => activity.get(sessionId),
  };
};

/**
 * Wraps `prompts`, so that `open` publishes `prompts` to `changes`, and again once the prompt leaves, answered or
 * closed.
 */
const publishingPrompts = (prompts: PermissionPrompts, changes: ChangeFeed): PermissionPrompts => ({
  open: (prompt, closed) => {
    const opened = prompts.open(prompt, closed);
    changes.publish('prompts');
    void opened.answer.then(() => changes.publish('prompts'));
    return opened;
  },
  get: (id) => prompts.get(id),
  list: () => prompts.list(),
  answer: (id, answer) => prompts.answer(id, answer),
});
