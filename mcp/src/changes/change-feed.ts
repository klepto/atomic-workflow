/**
 * Resource of the repository server that a change touches: `sessions`, the set of attached sessions, `messages`, the
 * message log, `tasks`, the tasks with their goals, design and tickets, `usage`, the usage limits of the account, or
 * `prompts`, the open permission prompts.
 */
export type ChangedResource = 'sessions' | 'messages' | 'tasks' | 'usage' | 'prompts';

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
   * returns the function that ends the subscription. The listeners run outside the call that marked the resource, so
   * a listener that throws skips the listeners and the resources after it, and its exception is uncaught.
   */
  subscribe(listener: (resource: ChangedResource) => void): () => void;
}

/**
 * Function that returns a new change feed, with no listener and no marked resource.
 */
export type CreateChangeFeedFunction = () => ChangeFeed;
