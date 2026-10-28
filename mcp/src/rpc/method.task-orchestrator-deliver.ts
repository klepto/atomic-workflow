import { z } from 'zod';
import { messageDeliverMethod } from './method.message-deliver.ts';
import { startSubagent } from './method.subagent-start.ts';
import { taskGetMethod } from './method.task-get.ts';
import type { Method, MethodContext } from './method.ts';
import { ORCHESTRATOR_JOB } from './session-name.ts';

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
 * `orchestrator`, which takes the commands of the task that need an agent. The latest started orchestrator of the task
 * that can take a message gets it. Without one, a new orchestrator starts inside the orchestrator session that
 * attached last, with the message as its first message. A task that does not exist fails with invalid parameters, and
 * the start of a new orchestrator fails as `subagentStart` does.
 */
export const taskOrchestratorDeliverMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'taskOrchestratorDeliver',
  description:
    'Gives a message to the orchestrator of a task, a subagent that takes the commands of the task, and starts it first when none is attached.',
  agent: false,
  params: PARAMS,
  handle: async ({ taskId, content }, context) => {
    await taskGetMethod.handle({ task: taskId }, context);
    const sessionId = await attachedOrchestratorOf(taskId, context);
    if (sessionId !== undefined) {
      await messageDeliverMethod.handle({ sessionId, content }, context);
      return { sessionId };
    }
    return startSubagent({ prompt: content, parentId: undefined, taskId, job: ORCHESTRATOR_JOB }, context);
  },
};

/**
 * Returns the session id of the latest started orchestrator of the task `taskId` that is attached and has an open
 * inbox, so that it can take a message, with the services of `context`. If there is none, returns `undefined` instead.
 */
const attachedOrchestratorOf = async (taskId: number, context: MethodContext): Promise<string | undefined> => {
  const attached = new Set(context.subagents.list().map(({ sessionId }) => sessionId));
  return (await context.sessions.list()).findLast(
    (session) =>
      session.taskId === taskId &&
      session.job === ORCHESTRATOR_JOB &&
      attached.has(session.id) &&
      context.inboxes.find(session.id) === session.id,
  )?.id;
};
