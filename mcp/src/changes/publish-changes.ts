import type { SessionActivity } from '../attachment/session-activity.ts';
import type { SessionConnections } from '../attachment/session-connections.ts';
import type { Subagents } from '../attachment/subagents.ts';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import type { TaskStore } from '../storage/task-store.ts';
import type { ChangeFeed } from './change-feed.ts';
import { feedPublishChanges } from './publish-changes.feed.ts';

/**
 * Services of the repository server that hold the state that the change feed names.
 */
export interface PublishedServices {
  /**
   * Store of the message log, whose changes are `messages`.
   */
  readonly messageLog: MessageLogStore;

  /**
   * Store of the tasks, whose changes are `tasks`.
   */
  readonly tasks: TaskStore;

  /**
   * Store of the sessions, whose changes of the task of a session are `sessions`.
   */
  readonly sessions: SessionStore;

  /**
   * Connections of the attached session servers, whose changes are `sessions`.
   */
  readonly sessionConnections: SessionConnections;

  /**
   * Subagents that run inside the attached orchestrator sessions, whose changes are `sessions`.
   */
  readonly subagents: Subagents;

  /**
   * Status of the agent of each session, whose changes are `sessions`.
   */
  readonly activity: SessionActivity;
}

/**
 * Function that wraps each service of `services`, so that it publishes its changes to `changes`, and returns the
 * wrapped services. A wrapped service does what the service does. `MessageLogStore.append` publishes `messages`,
 * `MessageLogStore.deleteSession` publishes `messages` once it resolves with a deleted message, and
 * each write of `TaskStore` publishes `tasks`, once it resolves. `SessionStore.setTask` and
 * `SessionStore.setTicket` publish `sessions` once they resolve with `true`, and `SessionStore.delete` publishes `sessions` and `messages` once it resolves with `true`. `SessionConnections.bind` publishes `sessions`, and
 * again once its connection closes. `Subagents.attach` and `Subagents.stop` publish `sessions`, and `Subagents.start`
 * publishes `sessions` once its connection closes, since that stops the subagent. `SessionActivity.report` publishes
 * `sessions` when the status changes. No read publishes.
 */
export type PublishChangesFunction = (services: PublishedServices, changes: ChangeFeed) => PublishedServices;

/**
 * Default `PublishChangesFunction`, which publishes each change to the feed as the service makes it.
 */
export const PublishChanges: PublishChangesFunction = feedPublishChanges;
