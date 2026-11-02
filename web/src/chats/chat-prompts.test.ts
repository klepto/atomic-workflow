import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListedSession, PermissionPrompt } from '@/api/types.ts';
import { listChats } from '@/chats/chat-list.ts';
import { promptsByChat } from '@/chats/chat-prompts.ts';

/**
 * Returns a session with the fields `fields`: by default an attached, idle subagent of no task, named for its id.
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
 * Returns an orchestrator session with the id `sessionId`, which holds the alias `main`.
 */
const orchestrator = (sessionId: string): ListedSession =>
  session({ sessionId, role: 'orchestrator', parentId: null, name: 'main', alias: 'main' });

/**
 * Returns an open prompt with the id `id` of the session `sessionId`, opened at `openedAt`.
 */
const prompt = (id: string, sessionId: string, openedAt: number): PermissionPrompt => ({
  id,
  sessionId,
  agentType: null,
  toolName: 'Bash',
  toolInput: { command: 'npm test' },
  suggestions: [],
  openedAt,
});

/**
 * Returns the ids of the prompts of each chat of `groups`, by the key of the chat.
 */
const idsOf = (groups: ReadonlyMap<string, readonly PermissionPrompt[]>): Record<string, string[]> =>
  Object.fromEntries([...groups].map(([key, prompts]) => [key, prompts.map(({ id }) => id)]));

describe('promptsByChat', () => {
  const chats = listChats([
    orchestrator('main-1'),
    orchestrator('main-2'),
    session({ sessionId: 'implement-1', alias: 'implement-cache' }),
    session({ sessionId: 'implement-2', alias: 'implement-cache' }),
    session({ sessionId: 'agent-1' }),
  ]);

  it('returns no entry without prompts', () => {
    assert.deepEqual(idsOf(promptsByChat([], chats)), {});
  });

  it('puts each prompt in the chat that holds its session', () => {
    const groups = promptsByChat(
      [prompt('a', 'agent-1', 1), prompt('b', 'implement-2', 2), prompt('c', 'main-1', 3)],
      chats,
    );
    assert.deepEqual(idsOf(groups), { 'agent-1': ['a'], 'implement-cache': ['b'], main: ['c'] });
  });

  it('puts the prompts of every session of an alias in the one chat of the alias', () => {
    const groups = promptsByChat([prompt('a', 'implement-1', 1), prompt('b', 'implement-2', 2)], chats);
    assert.deepEqual(idsOf(groups), { 'implement-cache': ['a', 'b'] });
  });

  it('orders the prompts of a chat oldest first', () => {
    const groups = promptsByChat(
      [prompt('late', 'agent-1', 30), prompt('early', 'agent-1', 10), prompt('middle', 'agent-1', 20)],
      chats,
    );
    assert.deepEqual(idsOf(groups), { 'agent-1': ['early', 'middle', 'late'] });
  });

  it('puts a prompt of a session of no chat in the chat of the main session', () => {
    const groups = promptsByChat([prompt('a', 'unknown', 1), prompt('b', 'main-2', 2)], chats);
    assert.deepEqual(idsOf(groups), { main: ['a', 'b'] });
  });

  it('leaves out a prompt of a session of no chat while there is no chat of the main session', () => {
    const subagents = listChats([session({ sessionId: 'agent-1' })]);
    const groups = promptsByChat([prompt('a', 'unknown', 1), prompt('b', 'agent-1', 2)], subagents);
    assert.deepEqual(idsOf(groups), { 'agent-1': ['b'] });
  });

  it('gives a chat whose prompt left no entry', () => {
    const before = promptsByChat([prompt('a', 'agent-1', 1), prompt('b', 'main-1', 2)], chats);
    const after = promptsByChat([prompt('b', 'main-1', 2)], chats);
    assert.equal(before.has('agent-1'), true);
    assert.equal(after.has('agent-1'), false);
  });
});
