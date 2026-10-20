import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `listAttachedSessions`, which takes none.
 */
const PARAMS = z.object({});

/**
 * `Method` named `listAttachedSessions`, which returns the ids of the sessions that attached session servers serve
 * now, in the order in which they were bound, the latest last. Each of them can take a message of `deliverMessage`.
 */
export const listAttachedSessionsMethod: Method<typeof PARAMS, { readonly sessionIds: readonly string[] }> = {
  name: 'listAttachedSessions',
  description: 'Returns the ids of the sessions of the repository that messages can be delivered to now.',
  agent: false,
  params: PARAMS,
  handle: async (_params, { sessionConnections }) => ({ sessionIds: sessionConnections.list() }),
};
