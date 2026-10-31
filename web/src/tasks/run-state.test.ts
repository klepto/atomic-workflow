import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { isRunActive, runStateOf } from '@/tasks/run-state.ts';

/**
 * Returns a session with the fields `fields`: by default an ended subagent of the task 1.
 */
const session = (fields: Partial<ListedSession>): ListedSession => ({
  sessionId: 'session',
  role: 'subagent',
  parentId: 'main',
  taskId: 1,
  ticketId: null,
  job: 'implement',
  name: 'implement',
  startedAt: null,
  lastActivityAt: null,
  attached: false,
  status: 'ended',
  turnStartedAt: null,
  latestAction: null,
  contextTokens: null,
  model: null,
  effort: null,
  alias: null,
  ...fields,
});

/**
 * Returns a task summary with the fields `fields`, and defaults for the others.
 */
const task = (fields: Partial<TaskSummary>): TaskSummary => ({
  id: 1,
  slug: 'task',
  status: 'complete',
  createdAt: 0,
  completedTickets: 0,
  totalTickets: 0,
  runStartedAt: null,
  runEndedAt: null,
  ...fields,
});

describe('runStateOf', () => {
  it('is neither active nor running without subagents of the task', () => {
    assert.deepEqual(runStateOf(1, []), { active: false, running: false });
  });

  it('is active and running while a subagent of the task works or waits', () => {
    assert.deepEqual(runStateOf(1, [session({ status: 'working' })]), { active: true, running: true });
    assert.deepEqual(runStateOf(1, [session({ status: 'waiting' })]), { active: true, running: true });
  });

  it('is running but not active while a subagent of the task is idle', () => {
    assert.deepEqual(runStateOf(1, [session({ status: 'idle' })]), { active: false, running: true });
  });

  it('is neither active nor running once every subagent of the task ended', () => {
    assert.deepEqual(runStateOf(1, [session({ status: 'ended' })]), { active: false, running: false });
  });

  it('ignores the subagents of other tasks and the orchestrator sessions', () => {
    const sessions = [
      session({ status: 'working', taskId: 2 }),
      session({ status: 'working', role: 'orchestrator', parentId: null }),
    ];
    assert.deepEqual(runStateOf(1, sessions), { active: false, running: false });
  });
});

describe('isRunActive', () => {
  it('returns false before a run started', () => {
    assert.equal(isRunActive(task({})), false);
  });

  it('returns true while a run started and has not ended', () => {
    assert.equal(isRunActive(task({ runStartedAt: 1_000 })), true);
  });

  it('returns false once the run ended', () => {
    assert.equal(isRunActive(task({ runStartedAt: 1_000, runEndedAt: 2_000 })), false);
  });
});
