/**
 * Statuses of a task, in order: `plan-goals`, `plan-design` and `plan-tickets` while the user works on its goals, its
 * design or its tickets, `complete` once its plan is complete, and `done` once its task branch landed on its base
 * branch. Until its plan is complete, every part of the plan can change. While it is complete, its design and the
 * tickets whose work has not started can still change.
 */
export const TASK_STATUSES = ['plan-goals', 'plan-design', 'plan-tickets', 'complete', 'done'] as const;

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
 * Modes of a ticket, which say who does its work: `unattended` for an agent alone from start to finish, `attended`
 * for an agent that needs the user between turns, and `manual` for the user, whom an agent guides and whose work it
 * checks.
 */
export const TICKET_MODES = ['unattended', 'attended', 'manual'] as const;

/**
 * Mode of a ticket, one of `TICKET_MODES`.
 */
export type TicketMode = (typeof TICKET_MODES)[number];

/**
 * Complexities of a ticket: `simple` for work that follows an existing pattern or makes small decisions inside the
 * design, across one or several files, and `complex` for cross-cutting work, tricky logic or real judgement.
 */
export const TICKET_COMPLEXITIES = ['simple', 'complex'] as const;

/**
 * Complexity of a ticket, one of `TICKET_COMPLEXITIES`.
 */
export type TicketComplexity = (typeof TICKET_COMPLEXITIES)[number];

/**
 * Types of a ticket, which say how its work runs: `code` for work that changes the code of the repository, in the
 * stages of `TICKET_STAGES`, and `other` for any other work, such as research or moving files, in one pass.
 */
export const TICKET_TYPES = ['code', 'other'] as const;

/**
 * Type of a ticket, one of `TICKET_TYPES`.
 */
export type TicketType = (typeof TICKET_TYPES)[number];

/**
 * Statuses of a ticket: `not-started` before its work starts, `in-progress` while it runs, `needs-review` once its
 * work landed on the task branch, `blocked` while it waits for the cause that its reason names, and `done` once its
 * review passed.
 */
export const TICKET_STATUSES = ['not-started', 'in-progress', 'needs-review', 'blocked', 'done'] as const;

/**
 * Status of a ticket, one of `TICKET_STATUSES`.
 */
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Stages of a ticket of the type `code`, in order: `prototype` meets the acceptance criteria without tests, `tests`
 * locks its behavior with tests, and `refactor` brings the code to its final shape while every test keeps passing.
 * A `simple` ticket runs `prototype` and `tests` only, and its prototype has its final shape at once.
 */
export const TICKET_STAGES = ['prototype', 'tests', 'refactor'] as const;

/**
 * Stage of a ticket, one of `TICKET_STAGES`.
 */
export type TicketStage = (typeof TICKET_STAGES)[number];

/**
 * Progress of the work of a ticket.
 */
export interface TicketProgress {
  /**
   * Status of the ticket.
   */
  readonly status: TicketStatus;

  /**
   * Stage that the work of the ticket is in, or `null` outside of the stages.
   */
  readonly stage: TicketStage | null;

  /**
   * Cause that a blocked ticket waits for, or `null` for a ticket that is not blocked.
   */
  readonly blockedReason: string | null;
}

/**
 * Ticket to store in the tickets of a task.
 */
export interface NewTicket {
  /**
   * Who does the work of the ticket.
   */
  readonly mode: TicketMode;

  /**
   * How the work of the ticket runs.
   */
  readonly type: TicketType;

  /**
   * Complexity of the work of the ticket, or `null` for a ticket in the mode `manual`, which no agent does.
   */
  readonly complexity: TicketComplexity | null;

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

  /**
   * Identifier of the earlier ticket of the same task whose landed work this ticket fixes, or `null` for a ticket that
   * fixes none. It is among `dependsOn` too.
   */
  readonly fixes: number | null;
}

/**
 * Ticket of a task: one unit of work, done in one session.
 */
export interface Ticket extends NewTicket, TicketProgress {
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
   * Design of the task in Markdown: the document of what gets built and why, or `null` before the first draft.
   */
  readonly design: string | null;

  /**
   * Branch that the task branch was made from, or `null` before the work on its first ticket starts.
   */
  readonly baseBranch: string | null;

  /**
   * Tickets of the task, in the order of their identifiers.
   */
  readonly tickets: readonly Ticket[];
}

/**
 * Task of a repository as it appears in a list of tasks, without its plan.
 */
export interface TaskSummary {
  /**
   * Identifier of the task.
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
   * Number of the tickets of the task that are completed: whose work landed on the task branch, with the status
   * `needs-review` or `done`.
   */
  readonly completedTickets: number;

  /**
   * Number of every ticket of the task, completed or not.
   */
  readonly totalTickets: number;
}

/**
 * Store of the tasks of a repository. A task stays stored until it is deleted.
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
   * Returns every task, in the order of their identifiers.
   */
  list(): Promise<TaskSummary[]>;

  /**
   * Deletes the task `id` with its goals and its tickets, and returns `true`. If no such task exists, returns `false`
   * instead.
   */
  delete(id: number): Promise<boolean>;

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
   * Replaces the tickets of the task `taskId` with `tickets`, and numbers them from 1 in their order. Each ticket keeps
   * the progress of the stored ticket with its identifier, and a ticket with a new identifier is `not-started`.
   * If no such task exists, a ticket depends on a ticket that `tickets` lacks, or a ticket has a complexity that does
   * not fit its mode, rejects.
   */
  setTickets(taskId: number, tickets: readonly NewTicket[]): Promise<void>;

  /**
   * Sets the status of the task `taskId` to `status`. A task that does not exist stays missing.
   */
  setStatus(taskId: number, status: TaskStatus): Promise<void>;

  /**
   * Sets the base branch of the task `taskId` to `branch`, or forgets it for `null`. A task that does not exist stays
   * missing.
   */
  setBaseBranch(taskId: number, branch: string | null): Promise<void>;

  /**
   * Sets the progress of the ticket `ticketId` of the task `taskId` to `progress`, and returns `true`. If the task has
   * no such ticket, returns `false` instead.
   */
  setTicketProgress(taskId: number, ticketId: number, progress: TicketProgress): Promise<boolean>;
}
