import type { ChangedResource, CreateChangeFeedFunction } from './change-feed.ts';

/**
 * Time in ms from the first mark of a resource until the feed tells its listeners, to take the marks that follow it
 * with the same calls.
 */
const COALESCE_DELAY = 50;

/**
 * State of one change feed.
 */
interface Feed {
  /**
   * Listeners of the feed, one per subscription.
   */
  readonly listeners: Set<(resource: ChangedResource) => void>;

  /**
   * Resources that were marked since the last time the feed told its listeners.
   */
  readonly marked: Set<ChangedResource>;

  /**
   * Timer that tells the listeners of the marked resources, or `undefined` while none runs.
   */
  timer: NodeJS.Timeout | undefined;
}

/**
 * `CreateChangeFeedFunction` that keeps the marked resources in a set, and tells the listeners `COALESCE_DELAY` ms
 * after the first mark, with at most one timer running.
 */
export const timerCreateChangeFeed: CreateChangeFeedFunction = () => {
  const feed: Feed = { listeners: new Set(), marked: new Set(), timer: undefined };
  return {
    publish: (resource) => publish(feed, resource),
    subscribe: (listener) => subscribe(feed, listener),
  };
};

/**
 * Marks `resource` in `feed`, and starts the timer that tells its listeners, unless one runs.
 */
const publish = (feed: Feed, resource: ChangedResource): void => {
  feed.marked.add(resource);
  feed.timer ??= setTimeout(() => flush(feed), COALESCE_DELAY);
};

/**
 * Takes the marked resources of `feed` and clears them, then calls each listener of `feed` once per resource.
 */
const flush = (feed: Feed): void => {
  feed.timer = undefined;
  const resources = [...feed.marked];
  feed.marked.clear();
  for (const resource of resources) for (const listener of [...feed.listeners]) listener(resource);
};

/**
 * Adds `listener` to the listeners of `feed`, and returns the function that removes it again.
 */
const subscribe = (feed: Feed, listener: (resource: ChangedResource) => void): (() => void) => {
  // A listener of its own per subscription, so that one function that subscribes twice is called twice.
  const subscription = (resource: ChangedResource): void => listener(resource);
  feed.listeners.add(subscription);
  return () => void feed.listeners.delete(subscription);
};
