import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegisteredSession } from '../storage/session-store.ts';
import type { NewTicket, Task } from '../storage/task-store.ts';
import { testStorage } from '../testing/test-storage.ts';
import { baseNameOf, isTicketJob, jobOfPrompt, sessionNames } from './session-name.ts';

/**
 * Fields of a session that its name depends on.
 */
type NamedSession = Pick<RegisteredSession, 'id' | 'role' | 'job' | 'taskId' | 'ticketId' | 'alias'>;

/**
 * Returns a subagent with the id `id` and no work, with the fields `fields`.
 */
const subagent = (id: string, fields: Partial<NamedSession> = {}): NamedSession => ({
  id,
  role: 'subagent',
  job: null,
  taskId: null,
  ticketId: null,
  alias: null,
  ...fields,
});

/**
 * Returns a new ticket of the type `code` with the slug `slug`.
 */
const ticket = (slug: string): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug,
  summary: 'Builds a part of the cache.',
  description: 'Build it.',
  dependsOn: [],
  fixes: null,
});

/**
 * Task 1 `cache-layer-redis`, with the ticket 1 `cache-key-format`.
 */
const TASK: Task = {
  id: 1,
  slug: 'cache-layer-redis',
  status: 'complete',
  createdAt: 0,
  goals: [],
  design: null,
  baseBranch: null,
  runStartedAt: null,
  runEndedAt: null,
  tickets: [{ ...ticket('cache-key-format'), id: 1, status: 'not-started', stage: null, blockedReason: null }],
};

describe('jobOfPrompt', () => {
  it('returns the name of the skill that the prompt runs, without the name of its plugin', () => {
    assert.equal(jobOfPrompt('/atomic-workflow:plan add a cache'), 'plan');
  });

  it('returns the name of a skill without a plugin', () => {
    assert.equal(jobOfPrompt('  /review'), 'review');
  });

  it('returns null for a prompt that runs no skill', () => {
    assert.equal(jobOfPrompt('Plan a cache with /atomic-workflow:plan'), null);
  });

  it('returns null without a prompt', () => {
    assert.equal(jobOfPrompt(undefined), null);
  });
});

describe('isTicketJob', () => {
  it('returns true for implement and each stage of it', () => {
    assert.deepEqual(['implement', 'implement-prototype', 'implement-tests', 'implement-refactor'].map(isTicketJob), [
      true,
      true,
      true,
      true,
    ]);
  });

  it('returns false for implement-all, another job and no job', () => {
    assert.deepEqual(['implement-all', 'plan', null].map(isTicketJob), [false, false, false]);
  });
});

describe('baseNameOf', () => {
  it('names an orchestrator session main, whatever its job', () => {
    assert.equal(baseNameOf({ ...subagent('s'), role: 'orchestrator', job: 'plan' }, TASK), 'main');
  });

  it('names a subagent with no job by agent- and the first 8 characters of its id', () => {
    assert.equal(baseNameOf(subagent('1a2b3c4d5e6f'), undefined), 'agent-1a2b3c4d');
  });

  it('names a subagent by its job and the slug of its task', () => {
    assert.equal(baseNameOf(subagent('s', { job: 'plan', taskId: 1 }), TASK), 'plan-cache-layer-redis');
  });

  it('names a subagent that works on one ticket by its job and the slug of its ticket', () => {
    const session = subagent('s', { job: 'implement', taskId: 1, ticketId: 1 });
    assert.equal(baseNameOf(session, TASK), 'implement-cache-key-format');
  });

  it('names a subagent by its job alone while its target is not known', () => {
    assert.deepEqual(
      [
        baseNameOf(subagent('s', { job: 'plan' }), undefined),
        baseNameOf(subagent('s', { job: 'implement', taskId: 1 }), TASK),
      ],
      ['plan', 'implement'],
    );
  });
});

describe('sessionNames', () => {
  it('numbers each later subagent of a name that is taken from 2 on', async () => {
    const { tasks } = testStorage();
    const goal = { summary: 'Cache', details: null, source: 'user' } as const;
    const task = await tasks.create({ slug: 'cache-layer-redis', createdAt: 0, goal });
    const sessions = [1, 2, 3].map((n) => subagent(`s${n}`, { job: 'plan', taskId: task.id }));
    assert.deepEqual(
      await sessionNames(sessions, tasks),
      new Map([
        ['s1', 'plan-cache-layer-redis'],
        ['s2', 'plan-cache-layer-redis-2'],
        ['s3', 'plan-cache-layer-redis-3'],
      ]),
    );
  });

  it('names a session with an alias by its alias, and numbers a session with no alias past every alias', async () => {
    const sessions = [
      subagent('s1', { job: 'plan', alias: 'plan' }),
      subagent('s2', { job: 'plan' }),
      subagent('s3', { job: 'plan', alias: 'plan' }),
    ];
    assert.deepEqual(
      await sessionNames(sessions, testStorage().tasks),
      new Map([
        ['s1', 'plan'],
        ['s2', 'plan-2'],
        ['s3', 'plan'],
      ]),
    );
  });

  it('names every orchestrator session main, by the alias that it holds', async () => {
    const sessions = [
      { ...subagent('m1'), role: 'orchestrator' as const, alias: 'main' },
      { ...subagent('m2'), role: 'orchestrator' as const, alias: 'main' },
    ];
    assert.deepEqual(
      await sessionNames(sessions, testStorage().tasks),
      new Map([
        ['m1', 'main'],
        ['m2', 'main'],
      ]),
    );
  });

  it('names a subagent of a task that does not exist by its job alone', async () => {
    const sessions = [subagent('s1', { job: 'plan', taskId: 9 })];
    assert.deepEqual(await sessionNames(sessions, testStorage().tasks), new Map([['s1', 'plan']]));
  });
});
