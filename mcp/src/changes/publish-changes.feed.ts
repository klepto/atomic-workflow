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
});

/**
 * Returns the result of `write`, and publishes `resource` to `changes` once `write` resolves. A write that rejects
 * publishes nothing.
 */
const published = async <T>(write: Promise<T>, changes: ChangeFeed, resource: ChangedResource): Promise<T> => {
  const result = await write;
  changes.publish(resource);
  return result;
};

/**
 * Wraps `store`, so that `append` publishes `messages` to `changes` once it resolves.
 */
const publishingMessageLog = (store: MessageLogStore, changes: ChangeFeed): MessageLogStore => ({
  append: (message) => published(store.append(message), changes, 'messages'),
  list: (query) => store.list(query),
});

/**
 * Wraps `store`, so that each write publishes `tasks` to `changes` once it resolves.
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
  };
};

/**
 * Wraps `store`, so that `setTask` publishes `sessions` to `changes` once it resolves with `true`.
 */
const publishingSessions = (store: SessionStore, changes: ChangeFeed): SessionStore => ({
  register: (session) => store.register(session),
  get: (id) => store.get(id),
  list: () => store.list(),
  setTask: async (id, taskId) => {
    const changed = await store.setTask(id, taskId);
    if (changed) changes.publish('sessions');
    return changed;
  },
});

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
 * Wraps `activity`, so that `report` publishes `sessions` to `changes` when the status changes.
 */
const publishingActivity = (activity: SessionActivity, changes: ChangeFeed): SessionActivity => ({
  report: (sessionId, status, at) => {
    const changed = activity.report(sessionId, status, at);
    if (changed) changes.publish('sessions');
    return changed;
  },
  get: (sessionId) => activity.get(sessionId),
});
