import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { testStorage } from '../testing/test-storage.ts';
import type { NewTask, NewTicket, Task, TaskStore, TicketProgress } from './task-store.ts';

/**
 * Failure of a write that breaks a constraint of the database, as `node:sqlite` throws it.
 */
const CONSTRAINT_FAILURE = { name: 'Error', code: 'ERR_SQLITE_ERROR', errstr: 'constraint failed' };

/**
 * Task to create in the tests, with the slug `cache-layer-redis` and one goal.
 */
const NEW_TASK: NewTask = {
  slug: 'cache-layer-redis',
  createdAt: 5,
  goal: { summary: 'Cache the reads', details: null, source: 'user' },
};

/**
 * Progress of a ticket whose work runs in the stage `tests`.
 */
const IN_TESTS: TicketProgress = { status: 'in-progress', stage: 'tests', blockedReason: null };

/**
 * Returns the task store of a new `testStorage`, which `after` of `context` closes.
 */
const taskStore = (context: TestContext): TaskStore => {
  const storage = testStorage();
  context.after(() => storage.close());
  return storage.tasks;
};

/**
 * Returns a ticket to store, an unattended simple ticket of the type `code` with the slug `ticket` and no dependency,
 * with the fields of `fields` instead.
 */
const ticket = (fields: Partial<NewTicket> = {}): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: 'ticket',
  summary: 'Do the work.',
  description: '## Acceptance criteria',
  dependsOn: [],
  fixes: null,
  ...fields,
});

/**
 * Returns the task `id` of `tasks`, and fails the test when it does not exist.
 */
const stored = async (tasks: TaskStore, id: number): Promise<Task> => {
  const task = await tasks.get(id);
  assert.ok(task !== undefined, `Task ${id} is not stored`);
  return task;
};

describe('sqliteTaskStore', () => {
  describe('create', () => {
    it('returns the new task with the status plan-goals, its first goal and an empty plan', async (context) => {
      const tasks = taskStore(context);
      assert.deepEqual(await tasks.create(NEW_TASK), {
        id: 1,
        slug: 'cache-layer-redis',
        status: 'plan-goals',
        createdAt: 5,
        design: null,
        baseBranch: null,
        runStartedAt: null,
        runEndedAt: null,
        goals: [{ id: 1, summary: 'Cache the reads', details: null, source: 'user' }],
        tickets: [],
      });
    });

    it('gives a task created later a greater identifier', async (context) => {
      const tasks = taskStore(context);
      const first = await tasks.create(NEW_TASK);
      const second = await tasks.create({ ...NEW_TASK, slug: 'second' });
      assert.equal(second.id > first.id, true);
    });

    it('never gives a new task the identifier of a deleted one', async (context) => {
      const tasks = taskStore(context);
      const deleted = await tasks.create(NEW_TASK);
      await tasks.delete(deleted.id);
      assert.equal((await tasks.create(NEW_TASK)).id > deleted.id, true);
    });
  });

  describe('get', () => {
    it('returns the stored task with its goals, its design and its tickets', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setDesign(id, '# Design');
      await tasks.setTickets(id, [ticket()]);
      const task = await stored(tasks, id);
      assert.equal(task.design, '# Design');
      assert.deepEqual(
        task.goals.map(({ summary }) => summary),
        ['Cache the reads'],
      );
      assert.deepEqual(
        task.tickets.map(({ id: ticketId, slug }) => ({ id: ticketId, slug })),
        [{ id: 1, slug: 'ticket' }],
      );
    });

    it('returns undefined for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).get(1), undefined);
    });
  });

  describe('list', () => {
    it('returns no task from an empty store', async (context) => {
      assert.deepEqual(await taskStore(context).list(), []);
    });

    it('returns the summary of every task in the order of their identifiers', async (context) => {
      const tasks = taskStore(context);
      await tasks.create(NEW_TASK);
      await tasks.create({ ...NEW_TASK, slug: 'second', createdAt: 7 });
      await tasks.startRun(2, 10);
      assert.deepEqual(await tasks.list(), [
        {
          id: 1,
          slug: 'cache-layer-redis',
          status: 'plan-goals',
          createdAt: 5,
          runStartedAt: null,
          runEndedAt: null,
          completedTickets: 0,
          totalTickets: 0,
        },
        {
          id: 2,
          slug: 'second',
          status: 'plan-goals',
          createdAt: 7,
          runStartedAt: 10,
          runEndedAt: null,
          completedTickets: 0,
          totalTickets: 0,
        },
      ]);
    });

    it('counts the tickets that need review or are done as completed', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket(), ticket(), ticket()]);
      await tasks.setTicketProgress(id, 1, { status: 'needs-review', stage: null, blockedReason: null });
      await tasks.setTicketProgress(id, 2, { status: 'done', stage: null, blockedReason: null });
      await tasks.setTicketProgress(id, 3, IN_TESTS);
      const [summary] = await tasks.list();
      assert.deepEqual([summary?.completedTickets, summary?.totalTickets], [2, 4]);
    });
  });

  describe('delete', () => {
    it('deletes the task with its goals and its tickets, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket({ dependsOn: [1] })]);
      assert.equal(await tasks.delete(id), true);
      assert.equal(await tasks.get(id), undefined);
      assert.deepEqual(await tasks.list(), []);
    });

    it('keeps the other tasks', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.create({ ...NEW_TASK, slug: 'second' });
      await tasks.delete(id);
      assert.deepEqual(
        (await tasks.list()).map(({ slug }) => slug),
        ['second'],
      );
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).delete(1), false);
    });
  });

  describe('addGoal', () => {
    it('adds the goal to the end of the goals of the task with the next identifier', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.addGoal(id, { summary: 'Expire the entries', details: 'After 5 min', source: 'agent' });
      assert.deepEqual((await stored(tasks, id)).goals, [
        { id: 1, summary: 'Cache the reads', details: null, source: 'user' },
        { id: 2, summary: 'Expire the entries', details: 'After 5 min', source: 'agent' },
      ]);
    });

    it('numbers the goals of each task from 1', async (context) => {
      const tasks = taskStore(context);
      await tasks.create(NEW_TASK);
      const { id } = await tasks.create({ ...NEW_TASK, slug: 'second' });
      assert.deepEqual(
        (await stored(tasks, id)).goals.map(({ id: goalId }) => goalId),
        [1],
      );
    });

    it('rejects for a task that does not exist', async (context) => {
      await assert.rejects(
        taskStore(context).addGoal(1, { summary: 'Cache the reads', details: null, source: 'user' }),
        CONSTRAINT_FAILURE,
      );
    });
  });

  describe('editGoal', () => {
    it('replaces the text of the goal, keeps its source, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.editGoal(id, 1, { summary: 'Cache every read', details: 'Of the API' }), true);
      assert.deepEqual((await stored(tasks, id)).goals, [
        { id: 1, summary: 'Cache every read', details: 'Of the API', source: 'user' },
      ]);
    });

    it('returns false for a goal that the task does not have', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.editGoal(id, 2, { summary: 'Cache every read', details: null }), false);
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).editGoal(1, 1, { summary: 'Cache every read', details: null }), false);
    });
  });

  describe('deleteGoal', () => {
    it('deletes the goal, moves each later goal down by one identifier, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.addGoal(id, { summary: 'Second', details: null, source: 'user' });
      await tasks.addGoal(id, { summary: 'Third', details: null, source: 'agent' });
      assert.equal(await tasks.deleteGoal(id, 1), true);
      assert.deepEqual((await stored(tasks, id)).goals, [
        { id: 1, summary: 'Second', details: null, source: 'user' },
        { id: 2, summary: 'Third', details: null, source: 'agent' },
      ]);
    });

    it('keeps the goals of the other tasks', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      const other = await tasks.create({ ...NEW_TASK, slug: 'second' });
      await tasks.addGoal(other.id, { summary: 'Second', details: null, source: 'user' });
      await tasks.deleteGoal(id, 1);
      assert.deepEqual(
        (await stored(tasks, other.id)).goals.map(({ id: goalId, summary }) => ({ id: goalId, summary })),
        [
          { id: 1, summary: 'Cache the reads' },
          { id: 2, summary: 'Second' },
        ],
      );
    });

    it('returns false for a goal that the task does not have', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.deleteGoal(id, 2), false);
      assert.equal((await stored(tasks, id)).goals.length, 1);
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).deleteGoal(1, 1), false);
    });
  });

  describe('setDesign', () => {
    it('replaces the design of the task, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setDesign(id, '# First');
      assert.equal(await tasks.setDesign(id, '# Second'), true);
      assert.equal((await stored(tasks, id)).design, '# Second');
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).setDesign(1, '# Design'), false);
    });
  });

  describe('setTickets', () => {
    it('numbers the tickets from 1 in their order, each not started', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [
        ticket({ slug: 'first' }),
        ticket({ slug: 'second', mode: 'manual', type: 'other', complexity: null, dependsOn: [1] }),
      ]);
      assert.deepEqual((await stored(tasks, id)).tickets, [
        { ...ticket({ slug: 'first' }), id: 1, status: 'not-started', stage: null, blockedReason: null },
        {
          ...ticket({ slug: 'second', mode: 'manual', type: 'other', complexity: null, dependsOn: [1] }),
          id: 2,
          status: 'not-started',
          stage: null,
          blockedReason: null,
        },
      ]);
    });

    it('returns the dependencies of a ticket in ascending order', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket(), ticket({ dependsOn: [2, 1] })]);
      assert.deepEqual((await stored(tasks, id)).tickets[2]?.dependsOn, [1, 2]);
    });

    it('stores the ticket that a ticket fixes', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket({ dependsOn: [1], fixes: 1 })]);
      assert.equal((await stored(tasks, id)).tickets[1]?.fixes, 1);
    });

    it('keeps the progress of the stored ticket with the same identifier', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket({ slug: 'old' })]);
      await tasks.setTicketProgress(id, 1, IN_TESTS);
      await tasks.setTickets(id, [ticket({ slug: 'new' }), ticket({ slug: 'added' })]);
      assert.deepEqual(
        (await stored(tasks, id)).tickets.map(({ slug, status, stage }) => ({ slug, status, stage })),
        [
          { slug: 'new', status: 'in-progress', stage: 'tests' },
          { slug: 'added', status: 'not-started', stage: null },
        ],
      );
    });

    it('deletes the stored tickets beyond the new ones with their dependencies', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket({ dependsOn: [1] }), ticket({ dependsOn: [2] })]);
      await tasks.setTickets(id, [ticket()]);
      await tasks.setTickets(id, [ticket(), ticket(), ticket()]);
      assert.deepEqual(
        (await stored(tasks, id)).tickets.map(({ dependsOn, status }) => ({ dependsOn, status })),
        [
          { dependsOn: [], status: 'not-started' },
          { dependsOn: [], status: 'not-started' },
          { dependsOn: [], status: 'not-started' },
        ],
      );
    });

    it('deletes every ticket of the task for an empty list', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket({ dependsOn: [1] })]);
      await tasks.setTickets(id, []);
      assert.deepEqual((await stored(tasks, id)).tickets, []);
    });

    it('resolves for an empty list of a task that does not exist', async (context) => {
      await taskStore(context).setTickets(1, []);
    });

    it('rejects a list that is not empty for a task that does not exist', async (context) => {
      await assert.rejects(taskStore(context).setTickets(1, [ticket()]), CONSTRAINT_FAILURE);
    });

    it('rejects a ticket that depends on a ticket that the list lacks', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await assert.rejects(tasks.setTickets(id, [ticket(), ticket({ dependsOn: [0] })]), CONSTRAINT_FAILURE);
    });

    it('rejects a ticket that lists one dependency twice', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await assert.rejects(tasks.setTickets(id, [ticket(), ticket({ dependsOn: [1, 1] })]), CONSTRAINT_FAILURE);
    });

    it('rejects a ticket that depends on itself or on a later ticket', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await assert.rejects(tasks.setTickets(id, [ticket({ dependsOn: [1] })]), CONSTRAINT_FAILURE);
      await assert.rejects(tasks.setTickets(id, [ticket({ dependsOn: [2] }), ticket()]), CONSTRAINT_FAILURE);
    });

    it('rejects a ticket that fixes itself or a later ticket', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await assert.rejects(tasks.setTickets(id, [ticket({ fixes: 1 })]), CONSTRAINT_FAILURE);
      await assert.rejects(tasks.setTickets(id, [ticket({ fixes: 2 }), ticket()]), CONSTRAINT_FAILURE);
    });

    it('rejects a complexity that does not fit the mode of the ticket', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await assert.rejects(
        tasks.setTickets(id, [ticket({ mode: 'manual', complexity: 'simple' })]),
        CONSTRAINT_FAILURE,
      );
      await assert.rejects(tasks.setTickets(id, [ticket({ mode: 'attended', complexity: null })]), CONSTRAINT_FAILURE);
    });

    it('keeps the stored tickets when it rejects', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket({ slug: 'kept' })]);
      await assert.rejects(
        tasks.setTickets(id, [ticket({ slug: 'new' }), ticket({ dependsOn: [3] })]),
        CONSTRAINT_FAILURE,
      );
      assert.deepEqual(
        (await stored(tasks, id)).tickets.map(({ slug }) => slug),
        ['kept'],
      );
    });
  });

  describe('setStatus', () => {
    it('sets the status of the task, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.setStatus(id, 'complete'), true);
      assert.equal((await stored(tasks, id)).status, 'complete');
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).setStatus(1, 'done'), false);
    });
  });

  describe('setBaseBranch', () => {
    it('sets the base branch of the task, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.setBaseBranch(id, 'main'), true);
      assert.equal((await stored(tasks, id)).baseBranch, 'main');
    });

    it('forgets the base branch of the task for null', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setBaseBranch(id, 'main');
      assert.equal(await tasks.setBaseBranch(id, null), true);
      assert.equal((await stored(tasks, id)).baseBranch, null);
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).setBaseBranch(1, 'main'), false);
    });
  });

  describe('setTicketProgress', () => {
    it('sets the progress of the ticket, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket(), ticket()]);
      const blocked: TicketProgress = { status: 'blocked', stage: 'prototype', blockedReason: 'The API is down.' };
      assert.equal(await tasks.setTicketProgress(id, 2, blocked), true);
      assert.deepEqual(
        (await stored(tasks, id)).tickets.map(({ status, stage, blockedReason }) => ({ status, stage, blockedReason })),
        [{ status: 'not-started', stage: null, blockedReason: null }, blocked],
      );
    });

    it('returns false for a ticket that the task does not have', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket()]);
      assert.equal(await tasks.setTicketProgress(id, 2, IN_TESTS), false);
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).setTicketProgress(1, 1, IN_TESTS), false);
    });

    it('rejects a status that is not one of TICKET_STATUSES', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket()]);
      // The store guards its table against a value that the types rule out, so the test passes one past them.
      const progress = { ...IN_TESTS, status: 'started' } as unknown as TicketProgress;
      await assert.rejects(tasks.setTicketProgress(id, 1, progress), CONSTRAINT_FAILURE);
    });

    it('rejects a stage that is not one of TICKET_STAGES', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.setTickets(id, [ticket()]);
      // The store guards its table against a value that the types rule out, so the test passes one past them.
      const progress = { ...IN_TESTS, stage: 'review' } as unknown as TicketProgress;
      await assert.rejects(tasks.setTicketProgress(id, 1, progress), CONSTRAINT_FAILURE);
    });
  });

  describe('startRun', () => {
    it('sets the start of the run of the task, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.startRun(id, 10), true);
      const { runStartedAt, runEndedAt } = await stored(tasks, id);
      assert.deepEqual({ runStartedAt, runEndedAt }, { runStartedAt: 10, runEndedAt: null });
    });

    it('clears the end of the run that ended before', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.startRun(id, 10);
      await tasks.endRun(id, 20);
      await tasks.startRun(id, 30);
      const { runStartedAt, runEndedAt } = await stored(tasks, id);
      assert.deepEqual({ runStartedAt, runEndedAt }, { runStartedAt: 30, runEndedAt: null });
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).startRun(1, 10), false);
    });
  });

  describe('endRun', () => {
    it('sets the end of the active run of the task, and returns true', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.startRun(id, 10);
      assert.equal(await tasks.endRun(id, 20), true);
      const { runStartedAt, runEndedAt } = await stored(tasks, id);
      assert.deepEqual({ runStartedAt, runEndedAt }, { runStartedAt: 10, runEndedAt: 20 });
    });

    it('ends the active run that started at startedAt', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.startRun(id, 10);
      assert.equal(await tasks.endRun(id, 20, 10), true);
      assert.equal((await stored(tasks, id)).runEndedAt, 20);
    });

    it('returns false and changes nothing for an active run that did not start at startedAt', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.startRun(id, 10);
      assert.equal(await tasks.endRun(id, 20, 5), false);
      assert.equal((await stored(tasks, id)).runEndedAt, null);
    });

    it('returns false and keeps the end for a run that ended already', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      await tasks.startRun(id, 10);
      await tasks.endRun(id, 20);
      assert.equal(await tasks.endRun(id, 30), false);
      assert.equal((await stored(tasks, id)).runEndedAt, 20);
    });

    it('returns false for a task that never ran', async (context) => {
      const tasks = taskStore(context);
      const { id } = await tasks.create(NEW_TASK);
      assert.equal(await tasks.endRun(id, 20), false);
      assert.equal((await stored(tasks, id)).runEndedAt, null);
    });

    it('returns false for a task that does not exist', async (context) => {
      assert.equal(await taskStore(context).endRun(1, 20), false);
    });
  });

  describe('endRuns', () => {
    it('ends the active run of every task, and returns the number of runs that it ended', async (context) => {
      const tasks = taskStore(context);
      for (const slug of ['active', 'also-active', 'ended', 'never-ran']) await tasks.create({ ...NEW_TASK, slug });
      await tasks.startRun(1, 10);
      await tasks.startRun(2, 11);
      await tasks.startRun(3, 12);
      await tasks.endRun(3, 13);
      assert.equal(await tasks.endRuns(30), 2);
      assert.deepEqual(
        (await tasks.list()).map(({ runStartedAt, runEndedAt }) => ({ runStartedAt, runEndedAt })),
        [
          { runStartedAt: 10, runEndedAt: 30 },
          { runStartedAt: 11, runEndedAt: 30 },
          { runStartedAt: 12, runEndedAt: 13 },
          { runStartedAt: null, runEndedAt: null },
        ],
      );
    });

    it('returns 0 when no run is active', async (context) => {
      const tasks = taskStore(context);
      await tasks.create(NEW_TASK);
      assert.equal(await tasks.endRuns(30), 0);
    });
  });
});
