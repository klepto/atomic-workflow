import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testChangeFeed } from './test-change-feed.ts';

describe('testChangeFeed', () => {
  it('records each published resource in order, repeats included', () => {
    const feed = testChangeFeed();
    feed.publish('prompts');
    feed.publish('tasks');
    feed.publish('prompts');
    assert.deepEqual(feed.published, ['prompts', 'tasks', 'prompts']);
  });

  it('calls no listener', () => {
    const feed = testChangeFeed();
    const heard: string[] = [];
    feed.subscribe((resource) => heard.push(resource))();
    feed.publish('sessions');
    assert.deepEqual(heard, []);
  });
});
