import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { resolveView } from '@/layout/view.ts';
import { parseRoute } from '@/routing/route.ts';

/**
 * Returns a session with the fields `fields`: by default an attached, idle subagent of no task, named for its id.
 */
const session = (fields: Partial<ListedSession> & Pick<ListedSession, 'sessionId'>): ListedSession => ({
  role: 'subagent',
  parentId: 'main-1',
  taskId: null,
  ticketId: null,
  job: null,
  name: fields.sessionId,
  startedAt: null,
  lastActivityAt: null,
  attached: true,
  status: 'idle',
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
 * Sessions of the repository: the main session, the orchestrator of the task 3, and a subagent of no task.
 */
const SESSIONS: readonly ListedSession[] = [
  session({ sessionId: 'main-1', role: 'orchestrator', parentId: null, name: 'main', alias: 'main' }),
  session({ sessionId: 'lead', taskId: 3, job: 'orchestrator', name: 'orchestrator-web' }),
  session({ sessionId: 'helper', name: 'agent-5e6f' }),
];

/**
 * Tasks of the repository.
 */
const TASKS: readonly TaskSummary[] = [task({ id: 3, slug: 'web' })];

describe('resolveView', () => {
  it('resolves nothing until both the sessions and the tasks are known', () => {
    const route = parseRoute('/task/3');
    for (const [sessions, tasks] of [
      [undefined, TASKS],
      [SESSIONS, undefined],
    ] as const) {
      assert.deepEqual(resolveView(route, sessions, tasks, undefined), {
        view: { openTask: undefined, chats: undefined, open: undefined, ticket: undefined },
        canonical: undefined,
        resolved: undefined,
      });
    }
  });

  it('opens the first chat of the repository at the root, with its canonical path', () => {
    const { view, canonical, resolved } = resolveView(parseRoute('/'), SESSIONS, TASKS, undefined);
    assert.equal(view.openTask, undefined);
    assert.deepEqual(
      view.chats?.map(({ key }) => key),
      ['main', 'lead', 'helper'],
    );
    assert.equal(view.open?.key, 'main');
    assert.equal(canonical, '/chat/main');
    assert.equal(resolved, undefined);
  });

  it('opens the chat that the route names, and notes the chat that the ref resolved to', () => {
    const { view, canonical, resolved } = resolveView(parseRoute('/chat/helper'), SESSIONS, TASKS, undefined);
    assert.equal(view.open?.key, 'helper');
    assert.equal(canonical, '/chat/agent-5e6f');
    assert.deepEqual(resolved, { ref: 'helper', sessionIds: ['helper'] });
  });

  it('opens the task that the route names by its id, with the canonical ref of the task', () => {
    const { view, canonical } = resolveView(parseRoute('/task/3'), SESSIONS, TASKS, undefined);
    assert.equal(view.openTask?.id, 3);
    assert.deepEqual(
      view.chats?.map(({ key }) => key),
      ['main', 'lead'],
    );
    assert.equal(view.open?.key, 'main');
    assert.equal(canonical, '/task/3-web/chat/main');
  });

  it('opens the orchestrator of the task by its name, with the canonical ref orchestrator', () => {
    const { view, canonical } = resolveView(parseRoute('/task/web/chat/orchestrator-web'), SESSIONS, TASKS, undefined);
    assert.equal(view.open?.key, 'lead');
    assert.equal(canonical, '/task/3-web/chat/orchestrator');
  });

  it('opens no task for a ref that names none, and lists the chats of the repository', () => {
    const { view, canonical } = resolveView(parseRoute('/task/9/chat/helper'), SESSIONS, TASKS, undefined);
    assert.equal(view.openTask, undefined);
    assert.equal(view.open?.key, 'helper');
    assert.equal(canonical, '/chat/agent-5e6f');
  });

  it('opens the first chat for a ref of a chat that names none', () => {
    const { view, canonical, resolved } = resolveView(parseRoute('/chat/gone'), SESSIONS, TASKS, undefined);
    assert.equal(view.open?.key, 'main');
    assert.equal(canonical, '/chat/main');
    assert.equal(resolved, undefined);
  });

  it('keeps a renamed chat open by the ref that resolved to it last', () => {
    const renamed = [...SESSIONS.slice(0, 2), session({ sessionId: 'helper', name: 'agent-5e6f', alias: 'plan-web' })];
    const { view, canonical, resolved } = resolveView(parseRoute('/chat/agent-5e6f'), renamed, TASKS, {
      ref: 'agent-5e6f',
      sessionIds: ['helper'],
    });
    assert.equal(view.open?.key, 'plan-web');
    assert.equal(canonical, '/chat/plan-web');
    assert.deepEqual(resolved, { ref: 'agent-5e6f', sessionIds: ['helper'] });
  });

  it('ignores the chat that another ref resolved to last', () => {
    const { view } = resolveView(parseRoute('/chat/gone'), SESSIONS, TASKS, { ref: 'other', sessionIds: ['helper'] });
    assert.equal(view.open?.key, 'main');
  });

  it('opens a ticket of the open task in place of a chat, with the ref of the route', () => {
    const { view, canonical } = resolveView(parseRoute('/task/3/2-diff/review'), SESSIONS, TASKS, undefined);
    assert.deepEqual(view.ticket, { ref: '2-diff', view: 'review' });
    assert.equal(view.open, undefined);
    assert.equal(canonical, '/task/3-web/2-diff/review');
  });

  it('opens the summary of a ticket', () => {
    const { view, canonical } = resolveView(parseRoute('/task/web/2'), SESSIONS, TASKS, undefined);
    assert.deepEqual(view.ticket, { ref: '2', view: 'summary' });
    assert.equal(canonical, '/task/3-web/2');
  });

  it('opens no ticket of a task that does not exist', () => {
    const { view, canonical } = resolveView(parseRoute('/task/9/2'), SESSIONS, TASKS, undefined);
    assert.equal(view.ticket, undefined);
    assert.equal(view.open?.key, 'main');
    assert.equal(canonical, '/chat/main');
  });

  it('returns the root as the canonical path without chats', () => {
    const { view, canonical } = resolveView(parseRoute('/'), [], [], undefined);
    assert.equal(view.open, undefined);
    assert.equal(canonical, '/');
  });
});
