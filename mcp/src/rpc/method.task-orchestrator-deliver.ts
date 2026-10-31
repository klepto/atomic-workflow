import { z } from 'zod';
import { findTask } from './find-task.ts';
import type { Method } from './method.ts';
import { ORCHESTRATOR_JOB } from './session-name.ts';
import { startSubagent } from './start-subagent.ts';

/**
 * Schema of the parameters of `taskOrchestratorDeliver`.
 */
const PARAMS = z.object({
  taskId: z.number().int().positive().describe('Identifier of the task whose orchestrator takes the message'),
  content: z.string().min(1).describe('Text of the message, such as a command that runs a skill'),
});

/**
 * `Method` named `taskOrchestratorDeliver`, which gives a message to the orchestrator of a task, and returns the
 * session id of that orchestrator. The orchestrator of a task is a subagent of the main session with the job
 * `orchestrator`, which holds the alias `orchestrator-<task slug>` and takes the commands of the task that need an
 * agent. The latest started subagent with that alias that can take a message gets it, as `startSubagent` does.
 * Without one, a new orchestrator starts inside the orchestrator session that attached last, with the message as its
 * first message. A task that does not exist fails with invalid parameters, and the start of a new orchestrator fails
 * as `startSubagent` does.
 */
export const taskOrchestratorDeliverMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'taskOrchestratorDeliver',
  description:
    'Gives a message to the orchestrator of a task, a subagent that takes the commands of the task, and starts it first when none is attached.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, content }, context) => {
    const task = await findTask(taskId, context.tasks);
    return startSubagent(
      { prompt: content, parentId: undefined, task, ticketId: null, job: ORCHESTRATOR_JOB },
      context,
    );
  },
};
