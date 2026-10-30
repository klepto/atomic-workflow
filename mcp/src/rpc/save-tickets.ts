import type { NewTicket, Task, Ticket } from '../storage/task-store.ts';
import { endWork } from './claim-tickets.ts';
import { findTask } from './find-task.ts';
import type { MethodContext } from './method.ts';
import { plural } from './plural.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { openAmendableTask } from './task-guards.ts';

/**
 * Replaces the tickets of the task `taskId`, which is not done, with `tickets`, numbered from 1 in their order, with
 * the services of `context`, and returns the task. A ticket that fixes another one depends on it too. On a complete
 * task, each ticket whose work started must stay as stored, with its identifier, its fields and its dependencies, and
 * keeps its progress. A task that does not exist, a ticket that depends on itself, on a later ticket or on one ticket
 * twice, a ticket that fixes itself or a later ticket, and a ticket with a complexity that does not fit its mode, fail
 * with invalid parameters. A done task, a change of a ticket whose work started, a fix of a ticket that does not need
 * review, and a ticket that another session holds fail with an invalid request. Rejects as the task store of `context`
 * does.
 */
export const saveTickets = async (
  taskId: number,
  tickets: readonly NewTicket[],
  context: MethodContext,
): Promise<Task> => {
  const stored = await openAmendableTask(taskId, context.tasks);
  checkShape(tickets);
  const saved = tickets.map(withFixDependency);
  // The claims keep each ticket that the list can change from starting, and each ticket that it fixes from its
  // approval, until the list is stored.
  const notStarted = stored.tickets.filter(({ status }) => status === 'not-started').map(({ id }) => id);
  const fixed = saved.flatMap(({ fixes }) => (fixes === null ? [] : [fixes]));
  const store = async (): Promise<Task> => {
    // The task is read again under the claims, so a change that ran in between is seen.
    const task = await openAmendableTask(taskId, context.tasks);
    checkLocked(task, saved);
    checkFixes(task, saved);
    await context.tasks.setTickets(taskId, saved);
    return findTask(taskId, context.tasks);
  };
  return endWork(taskId, [...new Set([...notStarted, ...fixed])], store, context);
};

/**
 * Checks that each ticket of `tickets` depends on earlier tickets only, each once, fixes an earlier ticket only, and
 * has a complexity that fits its mode. A ticket that does not fails with invalid parameters.
 */
const checkShape = (tickets: readonly NewTicket[]): void => {
  const invalid = tickets.findIndex(
    ({ dependsOn }, index) => new Set(dependsOn).size !== dependsOn.length || dependsOn.some((id) => id > index),
  );
  if (invalid !== -1)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_PARAMS,
      `Ticket ${invalid + 1} must depend on earlier tickets, each once`,
    );
  const late = tickets.findIndex(({ fixes }, index) => fixes !== null && fixes > index);
  if (late !== -1) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, `Ticket ${late + 1} must fix an earlier ticket`);
  const misfit = tickets.findIndex(({ mode, complexity }) => (mode === 'manual') !== (complexity === null));
  if (misfit !== -1)
    throw new RpcError(
      RPC_ERROR_CODES.INVALID_PARAMS,
      `Ticket ${misfit + 1} must have a complexity, unless its mode is manual, which has none`,
    );
};

/**
 * Returns `ticket` with the ticket that it fixes among its dependencies, each of them once, in order.
 */
const withFixDependency = (ticket: NewTicket): NewTicket => {
  const dependsOn = ticket.fixes === null ? ticket.dependsOn : [...ticket.dependsOn, ticket.fixes];
  return { ...ticket, dependsOn: [...new Set(dependsOn)].sort((first, second) => first - second) };
};

/**
 * Checks that each ticket of `task` whose work started stays as stored in `tickets`, with its identifier, its fields
 * and its dependencies. A ticket that does not fails with an invalid request, whose message names each such ticket.
 */
const checkLocked = (task: Task, tickets: readonly NewTicket[]): void => {
  const changed = task.tickets.filter(
    (stored) => stored.status !== 'not-started' && !isSameTicket(stored, tickets[stored.id - 1]),
  );
  if (changed.length === 0) return;
  const names = changed.map(({ id, status }) => `${id} (${status})`).join(', ');
  const count = changed.length;
  throw new RpcError(
    RPC_ERROR_CODES.INVALID_REQUEST,
    `${plural(count, 'Ticket', 'Tickets')} ${names} of task ${task.id} started already, so ${plural(count, 'it', 'each')} must stay as stored, with the same number, fields and dependencies. Only a ticket that is not-started may change or go away, and a new ticket goes at the end`,
  );
};

/**
 * Returns whether `ticket` has every field and every dependency of `stored`.
 */
const isSameTicket = (stored: Ticket, ticket: NewTicket | undefined): boolean =>
  ticket !== undefined &&
  stored.mode === ticket.mode &&
  stored.type === ticket.type &&
  stored.complexity === ticket.complexity &&
  stored.slug === ticket.slug &&
  stored.summary === ticket.summary &&
  stored.description === ticket.description &&
  stored.fixes === ticket.fixes &&
  stored.dependsOn.join() === ticket.dependsOn.join();

/**
 * Checks that each ticket of `tickets` whose work has not started fixes only a ticket of `task` that needs review. A
 * ticket whose work started stays as stored, so the ticket that it fixes may be done since. A ticket that does not
 * fails with an invalid request.
 */
const checkFixes = (task: Task, tickets: readonly NewTicket[]): void => {
  tickets.forEach(({ fixes }, index) => {
    const started = (task.tickets[index]?.status ?? 'not-started') !== 'not-started';
    if (fixes === null || started) return;
    const status = task.tickets[fixes - 1]?.status ?? 'not-started';
    if (status !== 'needs-review')
      throw new RpcError(
        RPC_ERROR_CODES.INVALID_REQUEST,
        `Ticket ${index + 1} fixes ticket ${fixes}, which is ${status}, and only a ticket whose work landed and needs review can get a fix`,
      );
  });
};
