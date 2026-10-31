import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTaskNotification } from '@/conversation/task-notification.ts';

describe('isTaskNotification', () => {
  it('returns true for a notification that a background task ended', () => {
    const text = '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>';
    assert.equal(isTaskNotification(text), true);
  });

  it('ignores the whitespace around the notification', () => {
    assert.equal(isTaskNotification('\n  <task-notification><status>failed</status></task-notification>\n'), true);
  });

  it('returns false for a text around a notification', () => {
    assert.equal(isTaskNotification('See <task-notification></task-notification>'), false);
    assert.equal(isTaskNotification('<task-notification></task-notification> and more'), false);
  });

  it('returns false for a plain text', () => {
    assert.equal(isTaskNotification('The task ended'), false);
  });
});
