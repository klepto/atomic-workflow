import { z } from 'zod';
import type { Method } from './method.ts';
import { jobOfPrompt } from './session-name.ts';
import { startSubagent } from './start-subagent.ts';

/**
 * Schema of the parameters of `subagentStart`.
 */
const PARAMS = z.object({
  prompt: z.string().min(1).optional().describe('First command of the subagent, none when left out'),
  parentId: z.string().optional().describe('Session id of the orchestrator, the one that attached last when left out'),
  taskId: z.number().int().positive().optional().describe('Identifier of the task that the subagent works on'),
});

/**
 * `Method` named `subagentStart`, which starts a subagent inside the orchestrator session `parentId`, or inside the
 * one that was bound last if no `parentId` is given, and returns the session id of the subagent once it has attached,
 * as `startSubagent` does. The subagent works on the task `taskId`, or on no task if no `taskId` is given. Its job is
 * the skill that the prompt runs, which names its chat. It fails as `startSubagent` does.
 */
export const subagentStartMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'subagentStart',
  description:
    'Starts a subagent inside an orchestrator session, by default the one that attached last, and returns its session id.',
  agent: false,
  params: PARAMS,
  handle: async ({ prompt, parentId, taskId }, context) =>
    startSubagent({ prompt, parentId, taskId, job: jobOfPrompt(prompt) }, context),
};
