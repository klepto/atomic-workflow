/**
 * A session of the repository in the result of `sessionList`, attached or not, as `ListedSession` of
 * `mcp/src/rpc/method.session-list.ts` declares it.
 */
export interface ListedSession {
  /**
   * Identifier of the session.
   */
  sessionId: string;

  /**
   * Role of the session: `orchestrator` for a session of Claude Code, `subagent` for a subagent inside one. It is
   * `SessionRole` of `mcp/src/storage/session-store.ts`.
   */
  role: 'orchestrator' | 'subagent';

  /**
   * Identifier of the orchestrator session that a subagent runs inside, or `null` for an orchestrator session.
   */
  parentId: string | null;

  /**
   * Identifier of the task that the session works on, or `null` for a session that was started for no task.
   */
  taskId: number | null;

  /**
   * Identifier of the ticket of the task `taskId` that the session works on, or `null` for none.
   */
  ticketId: number | null;

  /**
   * Job of a subagent, such as `plan`, `implement` or `orchestrator` for the orchestrator of a task, or `null` for a
   * session with no known job.
   */
  job: string | null;

  /**
   * Name of the chat of the session: `main` for an orchestrator session, and for a subagent its job with the slug of
   * its target, such as `implement-cache-key-format`, unique among the subagents.
   */
  name: string;

  /**
   * Time when the session started, in ms since the epoch, or `null` when it is not known.
   */
  startedAt: number | null;

  /**
   * Time of the latest message of the session, in ms since the epoch, or `null` for none.
   */
  lastActivityAt: number | null;

  /**
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  attached: boolean;

  /**
   * Status of the session: `ended` for a session that is not attached, and for an attached one whether its agent is
   * `idle`, `working`, or `waiting` for the user. It is `SessionStatus` of `mcp/src/rpc/method.session-list.ts`.
   */
  status: 'ended' | 'idle' | 'working' | 'waiting';
}

/**
 * A message of the message log in the result of `messageList`, as `LoggedMessage` of
 * `mcp/src/storage/message-log-store.ts` declares it.
 */
export interface LoggedMessage {
  /**
   * Identifier of the message. A message added later has a greater identifier.
   */
  id: number;

  /**
   * Identifier of the registered session that the message belongs to.
   */
  sessionId: string;

  /**
   * Identifier that the agent gives the message, unique in its session, or `null` for none.
   */
  messageId: string | null;

  /**
   * Who wrote the message: `user` for a message of the user, `agent` for a message of the agent. It is
   * `MessageSender` of `mcp/src/storage/message-log-store.ts`.
   */
  sender: 'user' | 'agent';

  /**
   * Text of the message.
   */
  content: string;

  /**
   * Time of the message, in ms since the epoch.
   */
  timestamp: number;
}

/**
 * A task of the repository in the result of `taskList`, without its plan, as `TaskSummary` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface TaskSummary {
  /**
   * Identifier of the task.
   */
  id: number;

  /**
   * Short name of the task in kebab case.
   */
  slug: string;

  /**
   * Status of the task, `TaskStatus` of `mcp/src/storage/task-store.ts`.
   */
  status: string;

  /**
   * Time when the task was created, in ms since the epoch.
   */
  createdAt: number;

  /**
   * Number of the tickets of the task whose work landed on the task branch, with the status `needs-review` or `done`.
   */
  completedTickets: number;

  /**
   * Number of every ticket of the task, completed or not.
   */
  totalTickets: number;
}

/**
 * A ticket of a task in the result of `taskGet`, with the fields that the web app reads, as `Ticket` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface Ticket {
  /**
   * Identifier of the ticket within its task, from 1 in the order of the tickets.
   */
  id: number;

  /**
   * Short name of the ticket in kebab case.
   */
  slug: string;

  /**
   * Summary of the ticket in one sentence.
   */
  summary: string;

  /**
   * Status of the ticket: `not-started` before its work starts, `in-progress` while it runs, `needs-review` once its
   * work landed on the task branch, `blocked` while it waits for a cause, and `done` once its review passed. It is
   * `TicketStatus` of `mcp/src/storage/task-store.ts`.
   */
  status: 'not-started' | 'in-progress' | 'needs-review' | 'blocked' | 'done';

  /**
   * Who does the work of the ticket: `unattended` for an agent alone, `attended` for an agent that needs the user
   * between turns, and `manual` for the user. It is `TicketMode` of `mcp/src/storage/task-store.ts`.
   */
  mode: 'unattended' | 'attended' | 'manual';

  /**
   * How the work of the ticket runs: `code` in stages, `other` in one pass. It is `TicketType` of
   * `mcp/src/storage/task-store.ts`.
   */
  type: 'code' | 'other';

  /**
   * Complexity of the work of the ticket, or `null` for a manual ticket. It is `TicketComplexity` of
   * `mcp/src/storage/task-store.ts`.
   */
  complexity: 'simple' | 'complex' | null;

  /**
   * Description of the ticket in Markdown.
   */
  description: string;

  /**
   * Identifiers of the tickets of the same task that must be done before this one.
   */
  dependsOn: readonly number[];

  /**
   * Identifier of the earlier ticket whose landed work this ticket fixes, or `null` for none.
   */
  fixes: number | null;

  /**
   * Stage that the work of the ticket is in, `prototype`, `tests` or `refactor`, or `null` outside of the stages.
   */
  stage: 'prototype' | 'tests' | 'refactor' | null;

  /**
   * Cause that a blocked ticket waits for, or `null` for a ticket that is not blocked.
   */
  blockedReason: string | null;
}

/**
 * The commit that holds the landed work of a ticket, the result of `ticketDiff`, as `TicketCommit` of
 * `mcp/src/worktree/worktrees.ts` declares it.
 */
export interface TicketCommit {
  /**
   * Id of the commit.
   */
  commit: string;

  /**
   * Changes of the commit against its parent, as the patch of `git show`, with renames detected and paths not quoted.
   */
  patch: string;
}

/**
 * The result of `ticketRequestChanges`, as `RequestedChanges` of `mcp/src/rpc/method.ticket-request-changes.ts`
 * declares it.
 */
export interface RequestedChanges {
  /**
   * The new ticket that makes the changes that the review asked for.
   */
  ticket: Ticket;

  /**
   * Why the server refused to approve the reviewed ticket, or `null` when it approved it, or when it was done already.
   */
  approvalRefusal: string | null;
}

/**
 * A task of the repository in the result of `taskGet`, with the fields that the web app reads, as `Task` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface TaskDetail {
  /**
   * Identifier of the task.
   */
  id: number;

  /**
   * Tickets of the task in the order of their ids.
   */
  tickets: readonly Ticket[];
}

/**
 * The repository that the server serves, the result of `repositoryGet` of `mcp/src/rpc/method.repository-get.ts`.
 */
export interface Repository {
  /**
   * Name of the repository: the last segment of `directory`, such as `atomic-workflow-mcp`.
   */
  name: string;

  /**
   * Absolute path of the main worktree of the repository.
   */
  directory: string;
}

/**
 * Name of an event of the stream at `/events`: the resource that changed, `ChangedResource` of
 * `mcp/src/changes/change-feed.ts`. `sessions` is the set of attached sessions with the status of each, `messages` the
 * message log, and `tasks` the tasks with their goals, design and tickets.
 */
export type ChangeEvent = 'sessions' | 'messages' | 'tasks';

/**
 * A skill that a session can run, in the result of `skillList`, as `TranscriptSkill` of
 * `mcp/src/transcript/find-transcript.ts` declares it.
 */
export interface Skill {
  /**
   * Name of the skill, with the name of its plugin before a colon for the skill of a plugin, such as
   * `atomic-workflow:plan`.
   */
  name: string;

  /**
   * What the skill does and when to use it, as the agent lists it.
   */
  description: string;
}
