import { z } from 'zod';
import type { Task } from '../storage/task-store.ts';
import { findTask } from './find-task.ts';
import type { Method, MethodContext } from './method.ts';
import { RpcError } from './rpc-error.ts';
import { argumentsOfPrompt, isTicketJob, jobOfPrompt } from './session-name.ts';
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
 * Pattern of a word that is a ticket id.
 */
const TICKET_ID = /^\d+$/;

/**
 * Task and ticket that a new subagent works on.
 */
interface SubagentTarget {
  /**
   * Task, or `undefined` for none.
   */
  readonly task: Task | undefined;

  /**
   * Identifier of the ticket of the task, or `null` for none.
   */
  readonly ticketId: number | null;
}

/**
 * `Method` named `subagentStart`, which starts a subagent inside the orchestrator session `parentId`, or inside the
 * one that was bound last if no `parentId` is given, and returns the session id of the subagent once it has attached,
 * as `startSubagent` does. Its job is the skill that the prompt runs. It works on the task `taskId`, else on the task
 * that the first word after the command of the prompt names. A subagent whose job works on one ticket works on the
 * ticket that the next word names. A word that names no task or no ticket of the task gives none, which is no failure.
 * When the job and its target give an alias that an attached subagent holds, that subagent takes the prompt instead,
 * as `startSubagent` says. A task `taskId` that does not exist fails with invalid parameters, and the start fails as
 * `startSubagent` does.
 */
export const subagentStartMethod: Method<typeof PARAMS, { readonly sessionId: string }> = {
  name: 'subagentStart',
  description:
    'Starts a subagent inside an orchestrator session, by default the one that attached last, and returns its session id.',
  agent: false,
  params: PARAMS,
  handle: async ({ prompt, parentId, taskId }, context) => {
    const job = jobOfPrompt(prompt);
    const target = await targetOf(prompt, job, taskId, context);
    return startSubagent({ prompt, parentId, job, ...target }, context);
  },
};

/**
 * Returns the target of a subagent with the job `job` and the first message `prompt`, with the services of `context`:
 * the task `taskId`, else the task that the first word after the command of `prompt` names. For a job that works on
 * one ticket, the target holds the ticket that the next word names, when the task has it. A task `taskId` that does
 * not exist fails with invalid parameters. Rejects as the task store of `context` does.
 */
const targetOf = async (
  prompt: string | undefined,
  job: string | null,
  taskId: number | undefined,
  context: MethodContext,
): Promise<SubagentTarget> => {
  const [taskWord, ticketWord] = argumentsOfPrompt(prompt);
  const task = taskId === undefined ? await taskOfWord(taskWord, context) : await findTask(taskId, context.tasks);
  const ticketId = task === undefined || !isTicketJob(job) ? null : ticketOfWord(task, ticketWord);
  return { task, ticketId };
};

/**
 * Returns the task that the word `word` names, as `findTask` finds it, with the services of `context`. If there is no
 * word, or it names no task, returns `undefined` instead. Rejects as the task store of `context` does.
 */
const taskOfWord = async (word: string | undefined, context: MethodContext): Promise<Task | undefined> => {
  if (word === undefined) return undefined;
  try {
    return await findTask(word, context.tasks);
  } catch (error) {
    // A word that names no task is a prompt with no target, such as `/atomic-workflow:run new cache layer`.
    if (error instanceof RpcError) return undefined;
    throw error;
  }
};

/**
 * Returns the id of the ticket of `task` that the word `word` names. If there is no word, or it names no ticket of
 * `task`, returns `null` instead.
 */
const ticketOfWord = (task: Task, word: string | undefined): number | null => {
  if (word === undefined || !TICKET_ID.test(word)) return null;
  const ticketId = Number(word);
  return task.tickets.some(({ id }) => id === ticketId) ? ticketId : null;
};
