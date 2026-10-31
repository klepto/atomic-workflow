import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testClock } from './test-clock.ts';
import { testConnection } from './test-connection.ts';
import { testMethodContext } from './test-method-context.ts';

/**
 * Work name of the task and of the ticket in the calls of the worktrees.
 */
const WORK = { id: 1, slug: 'cache-layer-redis' };

describe('testMethodContext', () => {
  it('returns session ids from session-1 on', () => {
    const context = testMethodContext();
    assert.deepEqual([context.createSessionId(), context.createSessionId()], ['session-1', 'session-2']);
  });

  it('counts the session ids of each context apart', () => {
    testMethodContext().createSessionId();
    assert.equal(testMethodContext().createSessionId(), 'session-1');
  });

  it('returns the await command line await <session id>', () => {
    assert.equal(testMethodContext().awaitCommandLine('session-7'), 'await session-7');
  });

  it('returns a timeout signal that does not abort', () => {
    assert.equal(testMethodContext().timeoutSignal(0).aborted, false);
  });

  it('has the main worktree /repository, no caller and a clock at 0', () => {
    const context = testMethodContext();
    assert.deepEqual([context.mainWorktree, context.caller, context.clock.now()], ['/repository', undefined, 0]);
  });

  it('starts with empty stores and attachment adapters', async () => {
    const context = testMethodContext();
    assert.deepEqual(await context.tasks.list(), []);
    assert.deepEqual(await context.sessions.list(), []);
    assert.deepEqual(context.sessionConnections.list(), []);
  });

  it('rejects each call of the worktrees with an error that says the test gave none', async () => {
    const { worktrees } = testMethodContext();
    const calls = [
      worktrees.create(WORK, WORK, null),
      worktrees.merge(WORK, WORK, 'message'),
      worktrees.ticketChanges(WORK, WORK, null),
      worktrees.ticketFilePatch(WORK, WORK, null, 'abc1234', 'cache.ts'),
      worktrees.unlandedTickets(WORK, null),
      worktrees.mergeTask(WORK, 'main'),
      worktrees.deleteTicket(WORK, WORK, false),
      worktrees.deleteTask(WORK, null, false),
    ];
    for (const call of calls) await assert.rejects(call, { name: 'Error', message: 'The test gave no worktrees' });
  });

  it('replaces each default by the field of the overrides', () => {
    const clock = testClock(9);
    const caller = testConnection();
    const context = testMethodContext({ clock, caller, mainWorktree: '/other' });
    assert.equal(context.clock, clock);
    assert.equal(context.caller, caller);
    assert.equal(context.mainWorktree, '/other');
  });
});
