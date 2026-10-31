import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TaskSummary, Ticket } from '@/api/types.ts';
import {
  findChat,
  findTask,
  findTicket,
  parseRoute,
  routePath,
  taskRefOf,
  ticketPath,
  ticketRefOf,
} from '@/routing/route.ts';

/**
 * Route of `/`, which names nothing.
 */
const ROOT = { taskRef: undefined, chatRef: undefined, ticketRef: undefined, ticketView: undefined };

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
 * Returns a ticket with the fields `fields`, and defaults for the others.
 */
const ticket = (fields: Partial<Ticket>): Ticket => ({
  id: 1,
  slug: 'ticket',
  summary: '',
  status: 'not-started',
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  description: '',
  dependsOn: [],
  fixes: null,
  stage: null,
  blockedReason: null,
  ...fields,
});

describe('parseRoute', () => {
  it('parses the root as no task and no chat', () => {
    assert.deepEqual(parseRoute('/'), ROOT);
  });

  it('parses a chat alone', () => {
    assert.deepEqual(parseRoute('/chat/main'), { ...ROOT, chatRef: 'main' });
  });

  it('parses a task alone', () => {
    assert.deepEqual(parseRoute('/task/3-url-routing-web'), { ...ROOT, taskRef: '3-url-routing-web' });
  });

  it('parses a chat of a task', () => {
    assert.deepEqual(parseRoute('/task/3/chat/orchestrator'), { ...ROOT, taskRef: '3', chatRef: 'orchestrator' });
  });

  it('parses the summary of a ticket of a task', () => {
    assert.deepEqual(parseRoute('/task/3/2-diff-view-page'), {
      ...ROOT,
      taskRef: '3',
      ticketRef: '2-diff-view-page',
      ticketView: 'summary',
    });
  });

  it('parses the review of a ticket of a task', () => {
    assert.deepEqual(parseRoute('/task/3/2/review'), { ...ROOT, taskRef: '3', ticketRef: '2', ticketView: 'review' });
  });

  it('ignores a trailing slash', () => {
    assert.deepEqual(parseRoute('/task/3/'), { ...ROOT, taskRef: '3' });
  });

  it('decodes each segment', () => {
    assert.deepEqual(parseRoute('/chat/a%20b%2Fc'), { ...ROOT, chatRef: 'a b/c' });
  });

  it('parses an unknown path as the root', () => {
    assert.deepEqual(parseRoute('/settings'), ROOT);
    assert.deepEqual(parseRoute('/chat'), ROOT);
    assert.deepEqual(parseRoute('/task/3/chat'), ROOT);
  });

  it('parses a path with too many segments as the root', () => {
    assert.deepEqual(parseRoute('/task/3/2/review/more'), ROOT);
  });

  it('parses a path with an empty segment as the root', () => {
    assert.deepEqual(parseRoute('/task//chat'), ROOT);
  });

  it('parses a path whose segment does not decode as the root', () => {
    assert.deepEqual(parseRoute('/chat/%E0%A4%A'), ROOT);
  });

  it('parses a path without a leading slash as the root', () => {
    assert.deepEqual(parseRoute('task/3'), ROOT);
  });
});

describe('routePath', () => {
  it('returns the root without a task and a chat', () => {
    assert.equal(routePath(undefined, undefined), '/');
  });

  it('formats a task, a chat, and both', () => {
    assert.equal(routePath('3-web', undefined), '/task/3-web');
    assert.equal(routePath(undefined, 'main'), '/chat/main');
    assert.equal(routePath('3-web', 'orchestrator'), '/task/3-web/chat/orchestrator');
  });

  it('encodes each segment', () => {
    assert.equal(routePath('a/b', 'c d'), '/task/a%2Fb/chat/c%20d');
  });

  it('formats a path that parses back to the same task and chat', () => {
    const refs: readonly (readonly [string | undefined, string | undefined])[] = [
      [undefined, undefined],
      ['3-url-routing-web', undefined],
      [undefined, 'agent-5e6f7a8b'],
      ['3', 'orchestrator'],
      ['a b/c', 'd%e'],
    ];
    for (const [taskRef, chatRef] of refs) {
      assert.deepEqual(parseRoute(routePath(taskRef, chatRef)), { ...ROOT, taskRef, chatRef });
    }
  });
});

describe('ticketPath', () => {
  it('formats the summary of a ticket without a last segment', () => {
    assert.equal(ticketPath('3-web', '2-diff', 'summary'), '/task/3-web/2-diff');
  });

  it('formats the review of a ticket with the last segment review', () => {
    assert.equal(ticketPath('3-web', '2-diff', 'review'), '/task/3-web/2-diff/review');
  });

  it('formats a path that parses back to the same ticket and view', () => {
    for (const ticketView of ['summary', 'review'] as const) {
      assert.deepEqual(parseRoute(ticketPath('3 web', '2/diff', ticketView)), {
        ...ROOT,
        taskRef: '3 web',
        ticketRef: '2/diff',
        ticketView,
      });
    }
  });
});

describe('ticketRefOf', () => {
  it('returns the id and the slug of the ticket', () => {
    assert.equal(ticketRefOf(ticket({ id: 2, slug: 'diff-view-page' })), '2-diff-view-page');
  });
});

describe('findTicket', () => {
  const tickets = [ticket({ id: 1, slug: '2' }), ticket({ id: 2, slug: 'diff' }), ticket({ id: 3, slug: '2-diff' })];

  it('finds a ticket by its canonical ref first', () => {
    assert.equal(findTicket(tickets, '2-diff')?.id, 2);
  });

  it('finds a ticket by its id before its slug', () => {
    assert.equal(findTicket(tickets, '2')?.id, 2);
  });

  it('finds a ticket by its slug', () => {
    assert.equal(findTicket(tickets, 'diff')?.id, 2);
  });

  it('returns undefined when no ticket matches', () => {
    assert.equal(findTicket(tickets, 'other'), undefined);
  });
});

describe('taskRefOf', () => {
  it('returns the id and the slug of the task', () => {
    assert.equal(taskRefOf(task({ id: 3, slug: 'url-routing-web' })), '3-url-routing-web');
  });
});

describe('findTask', () => {
  const tasks = [task({ id: 1, slug: 'cache' }), task({ id: 3, slug: 'web' })];

  it('finds a task by its canonical ref, its id or its slug', () => {
    assert.equal(findTask(tasks, '3-web')?.id, 3);
    assert.equal(findTask(tasks, '1')?.id, 1);
    assert.equal(findTask(tasks, 'web')?.id, 3);
  });

  it('returns undefined when no task matches', () => {
    assert.equal(findTask(tasks, '2'), undefined);
  });
});

describe('findChat', () => {
  const chats = [
    { ref: 'main', name: 'main', key: 'main', sessionIds: ['main-1', 'main-2'] },
    { ref: 'orchestrator', name: 'orchestrator-web', key: 'session-1', sessionIds: ['session-1'] },
    { ref: 'plan-web', name: 'plan-web', key: 'orchestrator', sessionIds: ['plan-1'] },
  ];

  it('finds a chat by its ref before its key', () => {
    assert.equal(findChat(chats, 'orchestrator')?.key, 'session-1');
  });

  it('finds a chat by its name', () => {
    assert.equal(findChat(chats, 'orchestrator-web')?.key, 'session-1');
  });

  it('finds a chat by its key', () => {
    assert.equal(findChat(chats, 'session-1')?.name, 'orchestrator-web');
  });

  it('finds a chat by the session id of any of its sessions', () => {
    assert.equal(findChat(chats, 'main-2')?.key, 'main');
  });

  it('returns undefined when no chat matches', () => {
    assert.equal(findChat(chats, 'other'), undefined);
  });
});
