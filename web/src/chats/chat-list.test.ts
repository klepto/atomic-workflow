import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListedSession } from '@/api/types.ts';
import { listChats } from '@/chats/chat-list.ts';

/**
 * Returns a session with the fields `fields`: by default an ended subagent of no task, named for its id.
 */
const session = (fields: Partial<ListedSession> & Pick<ListedSession, 'sessionId'>): ListedSession => ({
  role: 'subagent',
  parentId: 'parent',
  taskId: null,
  ticketId: null,
  job: null,
  name: fields.sessionId,
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
 * Returns an orchestrator session with the fields `fields`, which holds the alias `main`, as the server gives every
 * orchestrator session.
 */
const orchestrator = (fields: Partial<ListedSession> & Pick<ListedSession, 'sessionId'>): ListedSession =>
  session({ role: 'orchestrator', parentId: null, name: 'main', alias: 'main', ...fields });

describe('listChats', () => {
  it('returns no chat without sessions', () => {
    assert.deepEqual(listChats([]), []);
  });

  it('gives every orchestrator session one main chat that sends to the one that attached last', () => {
    const [main, ...others] = listChats([
      orchestrator({ sessionId: 'first', attached: true, status: 'idle' }),
      orchestrator({ sessionId: 'second', attached: true, status: 'working', turnStartedAt: 5_000 }),
      orchestrator({ sessionId: 'old', attached: false }),
    ]);
    assert.deepEqual(others, []);
    assert.equal(main?.key, 'main');
    assert.equal(main?.label, 'main session');
    assert.equal(main?.ref, 'main');
    assert.equal(main?.sessionId, 'second');
    assert.equal(main?.status, 'working');
    assert.equal(main?.turnStartedAt, 5_000);
    assert.deepEqual(main?.sessionIds, ['first', 'second', 'old']);
    assert.deepEqual(main?.logQuery, { alias: 'main' });
  });

  it('shows the main chat ended while no orchestrator session is attached', () => {
    const [main] = listChats([orchestrator({ sessionId: 'old', status: 'ended' })]);
    assert.equal(main?.sessionId, undefined);
    assert.equal(main?.status, 'ended');
    assert.equal(main?.turnStartedAt, null);
  });

  it('takes the start and the model of the main chat from the attached session', () => {
    const [main] = listChats([
      orchestrator({ sessionId: 'attached', attached: true, status: 'idle', startedAt: 1_000, model: 'claude-a' }),
      orchestrator({ sessionId: 'newer', startedAt: 9_000, model: 'claude-b' }),
    ]);
    assert.equal(main?.startedAt, 1_000);
    assert.equal(main?.model, 'claude-a');
  });

  it('takes the start and the model of the main chat from the newest session while none is attached', () => {
    const [main] = listChats([
      orchestrator({ sessionId: 'older', startedAt: 1_000, model: 'claude-a' }),
      orchestrator({ sessionId: 'newer', startedAt: 9_000, model: 'claude-b', contextTokens: 500 }),
      orchestrator({ sessionId: 'unknown', startedAt: null, model: 'claude-c' }),
    ]);
    assert.equal(main?.startedAt, 9_000);
    assert.equal(main?.model, 'claude-b');
    assert.equal(main?.contextTokens, 500);
  });

  it('lists every subagent after the main chat, the latest activity first', () => {
    const chats = listChats([
      orchestrator({ sessionId: 'main-1' }),
      session({ sessionId: 'quiet', startedAt: 1_000 }),
      session({ sessionId: 'busy', startedAt: 1_000, lastActivityAt: 8_000 }),
      session({ sessionId: 'fresh', startedAt: 5_000 }),
    ]);
    assert.deepEqual(
      chats.map((chat) => chat.key),
      ['main', 'busy', 'fresh', 'quiet'],
    );
  });

  it('gives a subagent the chat of its name, its session and its messages', () => {
    const [chat] = listChats([
      session({ sessionId: 'agent-1', name: 'plan-web', attached: true, status: 'waiting', effort: 'xhigh' }),
    ]);
    assert.deepEqual(chat, {
      key: 'agent-1',
      name: 'plan-web',
      label: 'plan-web',
      ref: 'plan-web',
      role: 'subagent',
      sessionIds: ['agent-1'],
      taskOrchestrator: false,
      sessionId: 'agent-1',
      status: 'waiting',
      turnStartedAt: null,
      latestAction: null,
      startedAt: null,
      lastActivityAt: null,
      contextTokens: null,
      model: null,
      effort: 'xhigh',
      logQuery: { sessionId: 'agent-1' },
    });
  });

  it('gives the sessions that hold one alias one chat named for the alias, which sends to the one attached last', () => {
    const chats = listChats([
      session({ sessionId: 'plan-1', alias: 'plan-web', startedAt: 1_000 }),
      session({ sessionId: 'plan-2', alias: 'plan-web', attached: true, status: 'idle', startedAt: 5_000 }),
      session({ sessionId: 'agent-1' }),
    ]);
    assert.deepEqual(
      chats.map((chat) => [chat.key, chat.name, chat.label, chat.ref, chat.sessionId]),
      [
        ['plan-web', 'plan-web', 'plan-web', 'plan-web', 'plan-2'],
        ['agent-1', 'agent-1', 'agent-1', 'agent-1', undefined],
      ],
    );
    assert.deepEqual(chats[0]?.sessionIds, ['plan-1', 'plan-2']);
    assert.deepEqual(chats[0]?.logQuery, { alias: 'plan-web' });
  });

  it('gives an ended subagent no session to send to', () => {
    const [chat] = listChats([session({ sessionId: 'agent-1', attached: false })]);
    assert.equal(chat?.sessionId, undefined);
  });

  it('lists only the subagents of the task with a task id', () => {
    const chats = listChats(
      [
        session({ sessionId: 'mine', taskId: 3 }),
        session({ sessionId: 'other', taskId: 4 }),
        session({ sessionId: 'none' }),
      ],
      3,
    );
    assert.deepEqual(
      chats.map((chat) => chat.key),
      ['mine'],
    );
  });

  it('lists the orchestrator of the task right after the main chat, with the ref orchestrator', () => {
    const chats = listChats(
      [
        orchestrator({ sessionId: 'main-1' }),
        session({ sessionId: 'worker', taskId: 3, lastActivityAt: 9_000 }),
        session({ sessionId: 'lead', taskId: 3, job: 'orchestrator', name: 'orchestrator-web', startedAt: 1_000 }),
      ],
      3,
    );
    assert.deepEqual(
      chats.map((chat) => [chat.key, chat.ref, chat.taskOrchestrator]),
      [
        ['main', 'main', false],
        ['lead', 'orchestrator', true],
        ['worker', 'worker', false],
      ],
    );
  });

  it('picks the latest started attached orchestrator of the task over a later started ended one', () => {
    const chats = listChats(
      [
        session({ sessionId: 'old', taskId: 3, job: 'orchestrator', startedAt: 1_000, attached: true }),
        session({ sessionId: 'new', taskId: 3, job: 'orchestrator', startedAt: 5_000 }),
      ],
      3,
    );
    assert.deepEqual(
      chats.map((chat) => [chat.key, chat.taskOrchestrator]),
      [
        ['old', true],
        ['new', false],
      ],
    );
  });

  it('picks the latest started orchestrator of the task while none is attached', () => {
    const [first] = listChats(
      [
        session({ sessionId: 'old', taskId: 3, job: 'orchestrator', startedAt: 1_000 }),
        session({ sessionId: 'new', taskId: 3, job: 'orchestrator', startedAt: 5_000 }),
      ],
      3,
    );
    assert.equal(first?.key, 'new');
  });

  it('gives no subagent the ref orchestrator without a task id', () => {
    const chats = listChats([session({ sessionId: 'lead', taskId: 3, job: 'orchestrator', name: 'orchestrator-web' })]);
    assert.deepEqual(
      chats.map((chat) => [chat.ref, chat.taskOrchestrator]),
      [['orchestrator-web', false]],
    );
  });
});
