import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapCreateSessionActivity } from './session-activity.map.ts';

describe('mapCreateSessionActivity', () => {
  describe('report', () => {
    it('starts a turn at the time of a first report of working', () => {
      const activity = mapCreateSessionActivity();
      assert.equal(activity.report('session-1', 'working', 100), true);
      assert.deepEqual(activity.get('session-1'), { status: 'working', turnStartedAt: 100, latestAction: null });
    });

    it('starts a turn at the time of a first report of waiting', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'waiting', 100);
      assert.deepEqual(activity.get('session-1'), { status: 'waiting', turnStartedAt: 100, latestAction: null });
    });

    it('keeps the start of the turn that runs and returns false for the same status again', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      assert.equal(activity.report('session-1', 'working', 200), false);
      assert.deepEqual(activity.get('session-1'), { status: 'working', turnStartedAt: 100, latestAction: null });
    });

    it('keeps the start of the turn when the status moves from working to waiting', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      assert.equal(activity.report('session-1', 'waiting', 200), true);
      assert.deepEqual(activity.get('session-1'), { status: 'waiting', turnStartedAt: 100, latestAction: null });
    });

    it('ends the turn on idle', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      assert.equal(activity.report('session-1', 'idle', 200), true);
      assert.deepEqual(activity.get('session-1'), { status: 'idle', turnStartedAt: null, latestAction: null });
    });

    it('ignores a status reported for an earlier time than the latest report', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 200);
      assert.equal(activity.report('session-1', 'idle', 100), false);
      assert.deepEqual(activity.get('session-1'), { status: 'working', turnStartedAt: 200, latestAction: null });
    });

    it('moves the start of the turn back for a late report of working after the end of the turn before', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.report('session-1', 'idle', 200);
      activity.report('session-1', 'working', 400);
      assert.equal(activity.report('session-1', 'working', 300), true);
      assert.deepEqual(activity.get('session-1'), { status: 'working', turnStartedAt: 300, latestAction: null });
    });

    it('keeps the start of the turn for a late report from before the end of the turn before', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.report('session-1', 'idle', 200);
      activity.report('session-1', 'working', 400);
      assert.equal(activity.report('session-1', 'working', 150), false);
      assert.deepEqual(activity.get('session-1'), { status: 'working', turnStartedAt: 400, latestAction: null });
    });
  });

  describe('reportAction', () => {
    it('sets the newest action of a working session', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      assert.equal(activity.reportAction('session-1', 'Bash: npm test', 150), true);
      assert.deepEqual(activity.get('session-1'), {
        status: 'working',
        turnStartedAt: 100,
        latestAction: 'Bash: npm test',
      });
    });

    it('clears the action with null', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.reportAction('session-1', 'Bash: npm test', 150);
      assert.equal(activity.reportAction('session-1', null, 160), true);
      assert.equal(activity.get('session-1')?.latestAction, null);
    });

    it('ignores an action older than the latest action', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.reportAction('session-1', 'Read: b.ts', 200);
      assert.equal(activity.reportAction('session-1', 'Read: a.ts', 150), false);
      assert.equal(activity.get('session-1')?.latestAction, 'Read: b.ts');
    });

    it('ignores an action from before the end of the latest turn', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.report('session-1', 'idle', 200);
      activity.report('session-1', 'working', 300);
      assert.equal(activity.reportAction('session-1', 'Read: a.ts', 200), false);
      assert.equal(activity.get('session-1')?.latestAction, null);
    });

    it('returns false for a session that has reported no status', () => {
      const activity = mapCreateSessionActivity();
      assert.equal(activity.reportAction('session-1', 'Read: a.ts', 100), false);
      assert.equal(activity.get('session-1'), undefined);
    });

    it('shows the action only while the session is working', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'waiting', 100);
      assert.equal(activity.reportAction('session-1', 'Read: a.ts', 150), false);
      assert.equal(activity.get('session-1')?.latestAction, null);
      activity.report('session-1', 'working', 200);
      assert.equal(activity.get('session-1')?.latestAction, 'Read: a.ts');
    });

    it('drops the action once the turn ends', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.reportAction('session-1', 'Read: a.ts', 150);
      activity.report('session-1', 'idle', 200);
      activity.report('session-1', 'working', 300);
      assert.equal(activity.get('session-1')?.latestAction, null);
    });
  });

  describe('forget', () => {
    it('forgets the activity of the session and returns true', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      assert.equal(activity.forget('session-1'), true);
      assert.equal(activity.get('session-1'), undefined);
    });

    it('returns false for a session without activity', () => {
      assert.equal(mapCreateSessionActivity().forget('session-1'), false);
    });
  });

  describe('get', () => {
    it('returns undefined for a session that has reported no status', () => {
      assert.equal(mapCreateSessionActivity().get('session-1'), undefined);
    });

    it('keeps the activity of each session apart', () => {
      const activity = mapCreateSessionActivity();
      activity.report('session-1', 'working', 100);
      activity.report('session-2', 'idle', 100);
      assert.equal(activity.get('session-1')?.status, 'working');
      assert.equal(activity.get('session-2')?.status, 'idle');
    });
  });
});
