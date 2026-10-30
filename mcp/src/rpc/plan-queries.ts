import type { Task, Ticket, TicketStatus } from '../storage/task-store.ts';

/**
 * Returns whether the work of a ticket with the status `status` landed on the task branch: `needs-review` or `done`.
 */
export const hasLanded = (status: TicketStatus): boolean => status === 'needs-review' || status === 'done';

/**
 * Returns whether a ticket with the status `status` is worked on: `in-progress` or `blocked`. Only such a ticket has a
 * stage, and only its work can merge.
 */
export const isWorking = (status: TicketStatus): boolean => status === 'in-progress' || status === 'blocked';

/**
 * Returns the ids of the tickets of `task` that `ticket` depends on and whose work has not landed, in the order of
 * `dependsOn`. A ticket can start only once this is empty.
 */
export const pendingDependencies = (task: Task, ticket: Ticket): readonly number[] =>
  ticket.dependsOn.filter((id) => {
    const dependency = task.tickets.find((other) => other.id === id);
    return dependency === undefined || !hasLanded(dependency.status);
  });
