/**
 * Statuses of a task, in order: `plan-goals`, `plan-design` and `plan-tickets` while the user works on its goals, its
 * design or its tickets, and `complete` once its plan is complete. Until then, every part of the plan can change.
 */
export const TASK_STATUSES = ['plan-goals', 'plan-design', 'plan-tickets', 'complete'] as const;

/**
 * Status of a task, one of `TASK_STATUSES`.
 */
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Sources of a goal: `user` for a goal that the user gave, and `agent` for a goal that the agent suggested and the
 * user accepted.
 */
export const GOAL_SOURCES = ['user', 'agent'] as const;

/**
 * Source of a goal, one of `GOAL_SOURCES`.
 */
export type GoalSource = (typeof GOAL_SOURCES)[number];

/**
 * Text of a goal.
 */
export interface GoalText {
  /**
   * Short summary of the goal, on one line.
   */
  readonly summary: string;

  /**
   * Further information and comments on the goal, or `null` for none.
   */
  readonly details: string | null;
}

/**
 * Goal to add to a task.
 */
export interface NewGoal extends GoalText {
  /**
   * Who the goal came from. It stays the same when the text of the goal changes.
   */
  readonly source: GoalSource;
}

/**
 * Goal of a task.
 */
export interface Goal extends NewGoal {
  /**
   * Identifier of the goal within its task, from 1 in the order of the goals, so the goals of a task have the
   * identifiers 1 to n.
   */
  readonly id: number;
}

/**
 * Complexities of a ticket: `simple` for mechanical work that follows an existing pattern, `moderate` for work across
 * several files with small decisions inside the design, and `complex` for cross-cutting work, tricky logic or real
 * judgement.
 */
export const TICKET_COMPLEXITIES = ['simple', 'moderate', 'complex'] as const;

/**
 * Complexity of a ticket, one of `TICKET_COMPLEXITIES`.
 */
export type TicketComplexity = (typeof TICKET_COMPLEXITIES)[number];

/**
 * Ticket to store in the tickets of a task.
 */
export interface NewTicket {
  /**
   * Complexity of the work of the ticket.
   */
  readonly complexity: TicketComplexity;

  /**
   * Short name of the ticket in kebab case.
   */
  readonly slug: string;

  /**
   * Summary of the ticket in one sentence.
   */
  readonly summary: string;

  /**
   * Description of the ticket in Markdown, with everything that an agent needs to do the work in a fresh context.
   */
  readonly description: string;

  /**
   * Identifiers of the tickets of the same task that must be done before this one, each less than its own.
   */
  readonly dependsOn: readonly number[];
}

/**
 * Ticket of a task: one unit of work that an agent does in one session.
 */
export interface Ticket extends NewTicket {
  /**
   * Identifier of the ticket within its task, from 1 in the order of the tickets.
   */
  readonly id: number;
}

/**
 * Task to create, with its first goal.
 */
export interface NewTask {
  /**
   * Short name of the task in kebab case.
   */
  readonly slug: string;

  /**
   * Time when the task is created, in ms since the epoch.
   */
  readonly createdAt: number;

  /**
   * First goal of the task.
   */
  readonly goal: NewGoal;
}

/**
 * Task of a repository, with its plan: its goals, its design and its tickets.
 */
export interface Task {
  /**
   * Identifier of the task. A task created later has a greater identifier, and the first one has 1.
   */
  readonly id: number;

  /**
   * Short name of the task in kebab case.
   */
  readonly slug: string;

  /**
   * Status of the task.
   */
  readonly status: TaskStatus;

  /**
   * Time when the task was created, in ms since the epoch.
   */
  readonly createdAt: number;

  /**
   * Goals of the task, in the order they were added.
   */
  readonly goals: readonly Goal[];

  /**
   * Design of the task in Markdown: the decisions that implement its goals, or `null` before the first draft.
   */
  readonly design: string | null;

  /**
   * Tickets of the task, in the order of their identifiers.
   */
  readonly tickets: readonly Ticket[];
}

/**
 * Store of the tasks of a repository. A task stays stored for good.
 */
export interface TaskStore {
  /**
   * Creates `task` with the status `plan-goals`, and returns it.
   */
  create(task: NewTask): Promise<Task>;

  /**
   * Returns the task with the identifier `id`. If no such task exists, returns `undefined` instead.
   */
  get(id: number): Promise<Task | undefined>;

  /**
   * Adds `goal` to the end of the goals of the task `taskId`, with the next identifier.
   * If no such task exists, rejects.
   */
  addGoal(taskId: number, goal: NewGoal): Promise<void>;

  /**
   * Replaces the text of the goal `goalId` of the task `taskId` with `text`, and returns `true`. If the task has no
   * such goal, returns `false` instead.
   */
  editGoal(taskId: number, goalId: number, text: GoalText): Promise<boolean>;

  /**
   * Deletes the goal `goalId` of the task `taskId`, moves each later goal of the task down by one identifier, and
   * returns `true`. If the task has no such goal, returns `false` instead.
   */
  deleteGoal(taskId: number, goalId: number): Promise<boolean>;

  /**
   * Replaces the design of the task `taskId` with `design`. A task that does not exist stays missing.
   */
  setDesign(taskId: number, design: string): Promise<void>;

  /**
   * Replaces the tickets of the task `taskId` with `tickets`, and numbers them from 1 in their order.
   * If no such task exists, or a ticket depends on a ticket that `tickets` lacks, rejects.
   */
  setTickets(taskId: number, tickets: readonly NewTicket[]): Promise<void>;

  /**
   * Sets the status of the task `taskId` to `status`. A task that does not exist stays missing.
   */
  setStatus(taskId: number, status: TaskStatus): Promise<void>;
}
