import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { orderByActivity } from '@/tasks/task-order.ts';

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

/**
 * Returns the ids of the tasks `tasks`, in their order.
 */
const idsOf = (tasks: readonly TaskSummary[]): readonly number[] => tasks.map((each) => each.id);

describe('orderByActivity', () => {
  it('puts the task created last first while no session works on a task', () => {
    const tasks = [task({ id: 1, createdAt: 100 }), task({ id: 2, createdAt: 200 })];
    assert.deepEqual(idsOf(orderByActivity(tasks, [])), [2, 1]);
  });

  it('puts the task with the latest message of a session first', () => {
    const tasks = [task({ id: 1, createdAt: 100 }), task({ id: 2, createdAt: 200 })];
    const sessions = [session({ taskId: 1, startedAt: 300, lastActivityAt: 400 })];
    assert.deepEqual(idsOf(orderByActivity(tasks, sessions)), [1, 2]);
  });

  it('takes the start of a session with no message as its activity', () => {
    const tasks = [task({ id: 1, createdAt: 100 }), task({ id: 2, createdAt: 200 })];
    const sessions = [session({ taskId: 1, startedAt: 300 })];
    assert.deepEqual(idsOf(orderByActivity(tasks, sessions)), [1, 2]);
  });

  it('takes the end of the latest run as activity', () => {
    const tasks = [
      task({ id: 1, createdAt: 100, runStartedAt: 150, runEndedAt: 300 }),
      task({ id: 2, createdAt: 200 }),
    ];
    assert.deepEqual(idsOf(orderByActivity(tasks, [])), [1, 2]);
  });

  it('ignores the sessions of no task', () => {
    const tasks = [task({ id: 1, createdAt: 100 }), task({ id: 2, createdAt: 200 })];
    const sessions = [session({ taskId: null, lastActivityAt: 400 })];
    assert.deepEqual(idsOf(orderByActivity(tasks, sessions)), [2, 1]);
  });

  it('keeps the order of tasks with the same activity', () => {
    const tasks = [task({ id: 1, createdAt: 100 }), task({ id: 2, createdAt: 100 })];
    assert.deepEqual(idsOf(orderByActivity(tasks, [])), [1, 2]);
  });
});
