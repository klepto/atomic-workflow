import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { deliverMessageMethod } from './method.deliver-message.ts';
import type { Method, MethodContext } from './method.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { deliverMethod } from './session-method.deliver.ts';
import { followSubagentMethod } from './session-method.follow-subagent.ts';

/**
 * Time in ms that a new subagent has to attach.
 */
const ATTACH_TIMEOUT = 60_000;

/**
 * Type of every subagent: the agent `worker` of the plugin, whose definition holds the loop of `awaitCommand`.
 */
const AGENT_TYPE = 'atomic-workflow:worker';

/**
 * Schema of the parameters of `startSubagent`.
 */
const PARAMS = z.object({
  prompt: z.string().min(1).optional().describe('First command of the subagent, none when left out'),
  parentId: z.string().optional().describe('Session id of the orchestrator, the one that attached last when left out'),
});

/**
 * `Method` named `startSubagent`, which starts a subagent inside the orchestrator session `parentId`, or inside the
 * one that was bound last if no `parentId` is given, and returns the session id of the subagent once it has attached.
 * The orchestrator spawns the subagent on a message that is delivered into its chat, and the subagent then waits for
 * its commands with `awaitCommand`. The prompt is the first command. Without that attached orchestrator session,
 * fails with an invalid request. A subagent that does not attach within `ATTACH_TIMEOUT` ms is stopped, and fails the
 * method.
 */
export const startSubagentMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'startSubagent',
  description:
    'Starts a subagent inside an orchestrator session, by default the one that attached last, and returns its session id.',
  agent: false,
  params: PARAMS,
  handle: async ({ prompt, parentId: pickedId }, context) => {
    const { sessions, sessionConnections, subagents } = context;
    const parentId = pickedId ?? sessionConnections.list().at(-1);
    const connection = parentId === undefined ? undefined : sessionConnections.get(parentId);
    const parent = parentId === undefined ? undefined : await sessions.get(parentId);
    if (parentId === undefined || connection === undefined || parent === undefined)
      throw new RpcError(RpcErrorCode.INVALID_REQUEST, 'No orchestrator session is attached');
    const sessionId = randomUUID();
    const { agent, directory } = parent;
    await sessions.register({ id: sessionId, agent, directory, startedAt: Date.now(), role: 'subagent', parentId });
    subagents.start(sessionId, parentId, connection);
    if (prompt !== undefined) await deliverMessageMethod.handle({ sessionId, content: prompt }, context);
    try {
      await spawn(context, connection, sessionId);
    } catch (error) {
      subagents.stop(sessionId);
      const reason = error instanceof Error ? error.message : String(error);
      throw new RpcError(RpcErrorCode.INTERNAL_ERROR, `The subagent ${sessionId} did not attach: ${reason}`);
    }
    const params: z.input<typeof followSubagentMethod.params> = { sessionId, parentId };
    await connection.request(followSubagentMethod.name, params);
    return { sessionId };
  },
};

/**
 * Asks the orchestrator session that serves `connection` to spawn the subagent `sessionId`, and resolves once the
 * subagent attaches. If the subagent does not attach within `ATTACH_TIMEOUT` ms, rejects.
 */
const spawn = async ({ subagents }: MethodContext, connection: RpcConnection, sessionId: string): Promise<void> => {
  const attached = subagents.waitForAttach(sessionId, AbortSignal.timeout(ATTACH_TIMEOUT));
  // The request below can fail before the wait is awaited, which must not leave its rejection unhandled.
  attached.catch(() => undefined);
  const params: z.input<typeof deliverMethod.params> = { content: spawnMessage(sessionId) };
  await connection.request(deliverMethod.name, params);
  await attached;
};

/**
 * Returns the message that asks an orchestrator to spawn the subagent `sessionId`. The prompt of the subagent names
 * only its session id, since the definition of the agent holds the loop. The message also asks the orchestrator to
 * ignore the notification that the subagent has completed, since the atomic-workflow server handles its result.
 */
const spawnMessage = (sessionId: string): string => {
  return [
    'Start a subagent for the atomic-workflow server now, and do nothing else for this message.',
    `Call the Agent tool with run_in_background set to true, subagent_type "${AGENT_TYPE}", description ` +
      `"atomic-workflow subagent ${sessionId.slice(0, 8)}", and exactly this prompt:`,
    '',
    `Your session id is ${sessionId}.`,
    '',
    'When this subagent completes, do not act on its result and do not reply about it. The atomic-workflow server ' +
      'handles it.',
  ].join('\n');
};
