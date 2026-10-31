import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { messageListMethod } from './method.message-list.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';
import { RPC_ERROR_CODES } from './rpc-error.ts';

/**
 * Returns a context in which the orchestrator session `main` of the alias `main` and its subagent `sub` of the alias
 * `cache-worker` are registered, with the messages 1 to 4 in the log: `main`, `sub`, `main`, `sub`.
 */
const loggedContext = async (): Promise<MethodContext> => {
  const context = testMethodContext();
  const base = { agent: 'claude', directory: '/repository', startedAt: 0 } as const;
  await context.sessions.register(
    newSession({ ...base, id: 'main', role: 'orchestrator', parentId: null, alias: 'main' }),
  );
  await context.sessions.register(
    newSession({ ...base, id: 'sub', role: 'subagent', parentId: 'main', alias: 'cache-worker' }),
  );
  for (const sessionId of ['main', 'sub', 'main', 'sub'])
    await context.messageLog.append({ sessionId, messageId: null, sender: 'agent', content: 'Done.', timestamp: 1 });
  return context;
};

/**
 * Returns the identifiers of the messages that `messageList` returns for the parameters `params` in `context`.
 */
const listedIds = async (params: object, context: MethodContext): Promise<readonly number[]> =>
  (await testCall(messageListMethod, params, context)).messages.map(({ id }) => id);

describe('messageListMethod', () => {
  it('returns the logged messages with every field', async () => {
    const context = await loggedContext();
    const { messages } = await testCall(messageListMethod, { after: 0, limit: 1 }, context);
    assert.deepEqual(messages, [
      { id: 1, sessionId: 'main', messageId: null, sender: 'agent', content: 'Done.', timestamp: 1 },
    ]);
  });

  it('returns the latest messages in the order of the log without an identifier to start after', async () => {
    assert.deepEqual(await listedIds({ limit: 2 }, await loggedContext()), [3, 4]);
  });

  it('returns the messages after the identifier from the start on', async () => {
    assert.deepEqual(await listedIds({ after: 1, limit: 2 }, await loggedContext()), [2, 3]);
  });

  it('returns only the messages of the session', async () => {
    assert.deepEqual(await listedIds({ sessionId: 'sub' }, await loggedContext()), [2, 4]);
  });

  it('returns only the messages of the sessions of the alias', async () => {
    const context = await loggedContext();
    assert.deepEqual(await listedIds({ alias: 'main' }, context), [1, 3]);
    assert.deepEqual(await listedIds({ alias: 'cache-worker' }, context), [2, 4]);
  });

  it('rejects both a session and an alias with invalid parameters', async () => {
    await assert.rejects(testCall(messageListMethod, { sessionId: 'sub', alias: 'main' }, await loggedContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
      message: 'A list of messages takes a session or an alias, not both',
    });
  });

  it('rejects a limit above 1000 with invalid parameters', async () => {
    await assert.rejects(testCall(messageListMethod, { limit: 1_001 }, await loggedContext()), {
      name: 'RpcError',
      code: RPC_ERROR_CODES.INVALID_PARAMS,
    });
  });
});
