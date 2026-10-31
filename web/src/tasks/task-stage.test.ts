import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TaskSummary } from '@/api/types.ts';
import { STAGES, stageOf, statusWordsOf } from '@/tasks/task-stage.ts';

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

describe('STAGES', () => {
  it('lists the stages in their order', () => {
    assert.deepEqual(
      STAGES.map(({ stage }) => stage),
      ['plan', 'implement', 'review', 'done'],
    );
  });
});

describe('stageOf', () => {
  it('returns plan while any phase of planning runs', () => {
    for (const status of ['plan-goals', 'plan-design', 'plan-tickets'] as const) {
      assert.equal(stageOf(task({ status })), 'plan');
    }
  });

  it('returns implement for a complete plan with tickets left', () => {
    assert.equal(stageOf(task({ status: 'complete', completedTickets: 1, totalTickets: 2 })), 'implement');
  });

  it('returns implement for a complete plan without tickets', () => {
    assert.equal(stageOf(task({ status: 'complete' })), 'implement');
  });

  it('returns review once the work of every ticket landed', () => {
    assert.equal(stageOf(task({ status: 'complete', completedTickets: 2, totalTickets: 2 })), 'review');
  });

  it('returns done once the task landed', () => {
    assert.equal(stageOf(task({ status: 'done' })), 'done');
  });
});

describe('statusWordsOf', () => {
  it('names the phase of planning while the task plans', () => {
    assert.equal(statusWordsOf(task({ status: 'plan-design' })), 'Planning the design');
  });

  it('names the stage of the task once its plan is complete', () => {
    assert.equal(statusWordsOf(task({ status: 'complete' })), 'Plan complete, tickets in work');
    assert.equal(
      statusWordsOf(task({ status: 'complete', completedTickets: 1, totalTickets: 1 })),
      'Every ticket landed, waiting for approval',
    );
    assert.equal(statusWordsOf(task({ status: 'done' })), 'Landed on its base branch');
  });
});
