import { timerCreateChangeFeed } from './change-feed.timer.ts';

/**
 * Resource of the repository server that a change touches: `sessions`, the set of attached sessions, `messages`, the
 * message log, or `tasks`, the tasks with their goals, design and tickets.
 */
export type ChangedResource = 'sessions' | 'messages' | 'tasks';

/**
 * Feed of the changes of the repository server, which names each changed resource to its listeners. It coalesces: a
 * burst of changes of one resource reaches each listener as one call.
 */
export interface ChangeFeed {
  /**
   * Marks `resource` as changed. A short delay later, each listener hears once of each resource that was marked by
   * then.
   */
  publish(resource: ChangedResource): void;

  /**
   * Calls `listener` with each changed resource from now on, including the marks of a delay that is under way, and
   * returns the function that ends the subscription.
   */
  subscribe(listener: (resource: ChangedResource) => void): () => void;
}

/**
 * Function that returns a new change feed, with no listener and no marked resource.
 */
export type CreateChangeFeedFunction = () => ChangeFeed;

/**
 * Default `CreateChangeFeedFunction`, which coalesces the changes with a timer.
 */
export const CreateChangeFeed: CreateChangeFeedFunction = timerCreateChangeFeed;
