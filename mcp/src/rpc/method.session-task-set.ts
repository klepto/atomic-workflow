import { z } from 'zod';
import { deriveSessionAlias } from './derive-session-alias.ts';
import type { Method } from './method.ts';
import { registeredSession } from './registered-session.ts';

/**
 * Schema of the parameters of `sessionTaskSet`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the registered session'),
  taskId: z.number().int().positive().describe('Identifier of the task that the session works on'),
  created: z.boolean().optional().describe('Whether the session created the task, false when left out'),
});

/**
 * `Method` named `sessionTaskSet`, which sets the task that a subagent works on to `taskId`. A subagent that works on
 * a task already keeps it, unless it created the task `taskId`: a subagent that creates a task works on it from then
 * on, such as one that was started for another task and plans a new one. A subagent that holds no alias then gets the
 * alias of its job and its task, or `plan-<task slug>` when it has no job and created the task, as
 * `deriveSessionAlias` says. An orchestrator session works on no task, since it serves every task. A session that is
 * not registered fails with invalid parameters.
 */
export const sessionTaskSetMethod: Method<typeof PARAMS, void> = {
  name: 'sessionTaskSet',
  description: 'Sets the task that a subagent works on, unless it works on a task already and did not create this one.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, taskId, created = false }, context) => {
    const { sessions } = context;
    const session = await registeredSession(sessionId, sessions);
    if (session.role !== 'subagent') return;
    await (created ? sessions.moveTask(sessionId, taskId) : sessions.setTask(sessionId, taskId));
    await deriveSessionAlias(sessionId, created, context);
  },
};
