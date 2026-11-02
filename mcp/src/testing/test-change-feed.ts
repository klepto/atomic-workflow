import type { ChangedResource, ChangeFeed } from '../changes/change-feed.ts';

/**
 * `ChangeFeed` of a test, which records each resource that it is told, at once and in order.
 */
export interface TestChangeFeed extends ChangeFeed {
  /**
   * Resources that the feed was told, in order.
   */
  readonly published: readonly ChangedResource[];
}

/**
 * Returns a new `TestChangeFeed`, which records each published resource at once, with no delay and no coalescing, and
 * calls no listener.
 */
export const testChangeFeed = (): TestChangeFeed => {
  const published: ChangedResource[] = [];
  return {
    published,
    publish: (resource) => void published.push(resource),
    subscribe: () => () => undefined,
  };
};
