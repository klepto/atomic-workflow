import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { timerCreateChangeFeed } from './change-feed.timer.ts';
import type { ChangedResource } from './change-feed.ts';

/**
 * Time in ms from the first mark of a resource until the feed tells its listeners, as `publish` of `ChangeFeed` names
 * a short delay.
 */
const COALESCE_DELAY = 50;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
});

describe('timerCreateChangeFeed', () => {
  describe('publish', () => {
    it('tells each listener of the resource once the delay has passed', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY - 1);
      assert.deepEqual(heard, []);
      mock.timers.tick(1);
      assert.deepEqual(heard, ['tasks']);
    });

    it('tells a burst of marks of one resource as one call', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      feed.publish('tasks');
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY - 10);
      feed.publish('tasks');
      mock.timers.tick(10);
      assert.deepEqual(heard, ['tasks']);
    });

    it('tells each marked resource once, in the order of the first marks', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      feed.publish('sessions');
      feed.publish('messages');
      feed.publish('sessions');
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, ['sessions', 'messages']);
    });

    it('tells a resource marked after the delay with a call of its own', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY);
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, ['tasks', 'tasks']);
    });

    it('tells nothing to a feed without listeners', () => {
      const feed = timerCreateChangeFeed();
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY);
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, []);
    });
  });

  describe('subscribe', () => {
    it('tells every listener', () => {
      const feed = timerCreateChangeFeed();
      const first: ChangedResource[] = [];
      const second: ChangedResource[] = [];
      feed.subscribe((resource) => first.push(resource));
      feed.subscribe((resource) => second.push(resource));
      feed.publish('messages');
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(first, ['messages']);
      assert.deepEqual(second, ['messages']);
    });

    it('calls a function that subscribed twice once per subscription', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      const listener = (resource: ChangedResource): void => void heard.push(resource);
      feed.subscribe(listener);
      feed.subscribe(listener);
      feed.publish('tasks');
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, ['tasks', 'tasks']);
    });

    it('tells a listener the marks of a delay that is under way', () => {
      const feed = timerCreateChangeFeed();
      feed.publish('tasks');
      const heard: ChangedResource[] = [];
      feed.subscribe((resource) => heard.push(resource));
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, ['tasks']);
    });

    it('returns the function that ends the subscription', () => {
      const feed = timerCreateChangeFeed();
      const heard: ChangedResource[] = [];
      const unsubscribe = feed.subscribe((resource) => heard.push(resource));
      feed.publish('tasks');
      unsubscribe();
      mock.timers.tick(COALESCE_DELAY);
      assert.deepEqual(heard, []);
    });
  });
});
