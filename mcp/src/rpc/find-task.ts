import { z } from 'zod';
import type { Task, TaskStore } from '../storage/task-store.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { SLUG } from './slug.ts';

/**
 * Schema of the reference to a task: its identifier, its slug, or both as `<id>-<slug>`.
 */
export const TASK_REFERENCE = z
  .union([z.number().int().positive(), z.string().min(1)])
  .describe('Task: its identifier, its slug, or both as <id>-<slug>, such as 3-cache-layer-redis');

/**
 * Returns the task of `tasks` that `reference` names. A word of digits names the task with that identifier. A word
 * `<id>-<slug>`, whose part after the first hyphen is a slug, names the task with that identifier, which must have that
 * slug. Any other word is a slug, and names the one task with that slug. A task that does not exist fails with invalid
 * parameters, and so does a slug that several tasks have, with a message that lists each of them as `<id>-<slug>`.
 * Rejects as `tasks` does.
 */
export const findTask = async (reference: number | string, tasks: TaskStore): Promise<Task> => {
  const word = String(reference);
  if (/^\d+$/.test(word)) return taskOfId(Number(word), tasks);
  const [, id = '', slug = ''] = /^(\d+)-(.+)$/.exec(word) ?? [];
  if (!SLUG.safeParse(slug).success) return taskOfSlug(word, tasks);
  const task = await taskOfId(Number(id), tasks);
  if (task.slug !== slug)
    throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No task ${word} exists: task ${id} is ${id}-${task.slug}`);
  return task;
};

/**
 * Returns the task of `tasks` with the identifier `id`. A task that does not exist fails with invalid parameters.
 */
const taskOfId = async (id: number, tasks: TaskStore): Promise<Task> => {
  const task = await tasks.get(id);
  if (task === undefined) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No task ${id} exists`);
  return task;
};

/**
 * Returns the one task of `tasks` with the slug `slug`. Without such a task, and with several, fails with invalid
 * parameters, whose message lists each of the several tasks as `<id>-<slug>`.
 */
const taskOfSlug = async (slug: string, tasks: TaskStore): Promise<Task> => {
  const [match, ...others] = (await tasks.list()).filter((task) => task.slug === slug);
  if (match === undefined) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `No task has the slug ${slug}`);
  if (others.length > 0) {
    const names = [match, ...others].map(({ id }) => `${id}-${slug}`).join(', ');
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_PARAMS,
      `Several tasks have the slug ${slug}: ${names}. Name one by its id`,
    );
  }
  return taskOfId(match.id, tasks);
};
