import { z } from 'zod';
import type { Method } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { deliverMethod } from './session-method.deliver.ts';

/**
 * Schema of the parameters of `deliverMessage`.
 */
const PARAMS = z.object({
  sessionId: z.string().describe('Identifier of the attached session to deliver the message to'),
  content: z.string().min(1).describe('Text of the message'),
});

/**
 * `Method` named `deliverMessage`, which puts a message into the chat of a session whose session server is attached,
 * and resolves once the session server has sent it to the agent. A session that no attached session server serves
 * fails with invalid parameters.
 */
export const deliverMessageMethod: Method<typeof PARAMS, void> = {
  name: 'deliverMessage',
  description: 'Puts a message into the chat of an attached session of the repository.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, content }, { sessionConnections }) => {
    const connection = sessionConnections.get(sessionId);
    if (connection === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is attached`);
    const params: z.input<typeof deliverMethod.params> = { content };
    await connection.request(deliverMethod.name, params);
  },
};
