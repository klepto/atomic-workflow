/**
 * Status of a task: `plan-goals`, `plan-design` or `plan-tickets` while its plan is drafted, `complete` once its plan
 * is complete, and `done` once the task is done. It is `TaskStatus` of `mcp/src/storage/task-store.ts`.
 */
export type TaskStatus = 'plan-goals' | 'plan-design' | 'plan-tickets' | 'complete' | 'done';

/**
 * Session of the repository in the result of `sessionList`, attached or not, as `ListedSession` of
 * `mcp/src/rpc/method.session-list.ts` declares it.
 */
export interface ListedSession {
  /**
   * Identifier of the session.
   */
  readonly sessionId: string;

  /**
   * Role of the session: `orchestrator` for a session of Claude Code, `subagent` for a subagent inside one. It is
   * `SessionRole` of `mcp/src/storage/session-store.ts`.
   */
  readonly role: 'orchestrator' | 'subagent';

  /**
   * Identifier of the orchestrator session that a subagent runs inside, or `null` for an orchestrator session.
   */
  readonly parentId: string | null;

  /**
   * Identifier of the task that the session works on, or `null` for a session that was started for no task.
   */
  readonly taskId: number | null;

  /**
   * Identifier of the ticket of the task `taskId` that the session works on, or `null` for none.
   */
  readonly ticketId: number | null;

  /**
   * Job of a subagent, such as `plan`, `implement` or `orchestrator` for the orchestrator of a task, or `null` for a
   * session with no known job.
   */
  readonly job: string | null;

  /**
   * Name of the chat of the session: `main` for an orchestrator session, and for a subagent its alias, or else its job
   * with the slug of its target, such as `implement-cache-key-format`, unique among the subagents with no alias.
   */
  readonly name: string;

  /**
   * Time when the session started, in ms since the epoch, or `null` when it is not known.
   */
  readonly startedAt: number | null;

  /**
   * Time of the latest message of the session, in ms since the epoch, or `null` for none.
   */
  readonly lastActivityAt: number | null;

  /**
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  readonly attached: boolean;

  /**
   * Status of the session: `ended` for a session that is not attached, and for an attached one whether its agent is
   * `idle`, `working`, or `waiting` for the user. It is `SessionStatus` of `mcp/src/rpc/method.session-list.ts`.
   */
  readonly status: 'ended' | 'idle' | 'working' | 'waiting';

  /**
   * Time when the current turn of the session started, in ms since the epoch: the time of the first transcript entry
   * of the turn. Non-null while `status` is `working` or `waiting`, and `null` while it is `idle` or `ended`.
   */
  readonly turnStartedAt: number | null;

  /**
   * Newest tool call of the current turn, in one line: the name of the tool, a colon, and its main argument, such as
   * `Bash: npm run typecheck` or `Read: C:/repo/src/app.ts`. At most 200 characters, cut with `…`. `null` while
   * `status` is not `working`, and when the agent made no tool call since its newest text message, since the log shows
   * that message already.
   */
  readonly latestAction: string | null;

  /**
   * Size of the context of the session in tokens: `input_tokens + cache_creation_input_tokens +
   * cache_read_input_tokens` of the usage of its newest model request in its transcript. `null` before its first model
   * request. Kept for an ended session, across restarts of the server.
   */
  readonly contextTokens: number | null;

  /**
   * Identifier of the model that answered the newest model request of the session, such as `claude-opus-5-5`. `null`
   * while it is not known. Kept for an ended session, across restarts of the server.
   */
  readonly model: string | null;

  /**
   * Reasoning effort of the newest model request of the session, such as `xhigh`. `null` while it is not known. Kept
   * for an ended session, across restarts of the server.
   */
  readonly effort: string | null;

  /**
   * Alias of the session, a display name of 1 to 60 characters that a feature gave it, or `null` while it has none.
   * Aliases are not unique.
   */
  readonly alias: string | null;
}

/**
 * Message of the message log in the result of `messageList`, as `LoggedMessage` of
 * `mcp/src/storage/message-log-store.ts` declares it.
 */
export interface LoggedMessage {
  /**
   * Identifier of the message. A message added later has a greater identifier.
   */
  readonly id: number;

  /**
   * Identifier of the registered session that the message belongs to.
   */
  readonly sessionId: string;

  /**
   * Identifier that the agent gives the message, unique in its session, or `null` for none.
   */
  readonly messageId: string | null;

  /**
   * Who wrote the message: `user` for a message of the user, `agent` for a message of the agent. It is
   * `MessageSender` of `mcp/src/storage/message-log-store.ts`.
   */
  readonly sender: 'user' | 'agent';

  /**
   * Text of the message.
   */
  readonly content: string;

  /**
   * Time of the message, in ms since the epoch.
   */
  readonly timestamp: number;
}

/**
 * Task of the repository in the result of `taskList`, without its plan, as `TaskSummary` of
 * `mcp/src/storage/task-store.ts` declares it.
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
   * Status of the task, `TaskStatus` of `mcp/src/storage/task-store.ts`.
   */
  readonly status: TaskStatus;

  /**
   * Time when the task was created, in ms since the epoch.
   */
  readonly createdAt: number;

  /**
   * Number of the tickets of the task whose work landed on the task branch, with the status `needs-review` or `done`.
   */
  readonly completedTickets: number;

  /**
   * Number of every ticket of the task, completed or not.
   */
  readonly totalTickets: number;

  /**
   * Start of the latest unattended run of the task, in ms since the epoch, or `null` when the task never ran.
   */
  readonly runStartedAt: number | null;

  /**
   * End of the latest unattended run of the task, in ms since the epoch, or `null` while that run is active or the
   * task never ran.
   */
  readonly runEndedAt: number | null;
}

/**
 * Goal of a task in the result of `taskGet`, with the fields that the web app reads, as `Goal` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface Goal {
  /**
   * Identifier of the goal within its task, from 1 in the order of the goals.
   */
  readonly id: number;

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
 * Ticket of a task in the result of `taskGet`, with the fields that the web app reads, as `Ticket` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface Ticket {
  /**
   * Identifier of the ticket within its task, from 1 in the order of the tickets.
   */
  readonly id: number;

  /**
   * Short name of the ticket in kebab case.
   */
  readonly slug: string;

  /**
   * Summary of the ticket in one sentence.
   */
  readonly summary: string;

  /**
   * Status of the ticket: `not-started` before its work starts, `in-progress` while it runs, `needs-review` once its
   * work landed on the task branch, `blocked` while it waits for a cause, and `done` once its review passed. It is
   * `TicketStatus` of `mcp/src/storage/task-store.ts`.
   */
  readonly status: 'not-started' | 'in-progress' | 'needs-review' | 'blocked' | 'done';

  /**
   * Who does the work of the ticket: `unattended` for an agent alone, `attended` for an agent that needs the user
   * between turns, and `manual` for the user. It is `TicketMode` of `mcp/src/storage/task-store.ts`.
   */
  readonly mode: 'unattended' | 'attended' | 'manual';

  /**
   * How the work of the ticket runs: `code` in stages, `other` in one pass. It is `TicketType` of
   * `mcp/src/storage/task-store.ts`.
   */
  readonly type: 'code' | 'other';

  /**
   * Complexity of the work of the ticket, or `null` for a manual ticket. It is `TicketComplexity` of
   * `mcp/src/storage/task-store.ts`.
   */
  readonly complexity: 'simple' | 'complex' | null;

  /**
   * Description of the ticket in Markdown.
   */
  readonly description: string;

  /**
   * Identifiers of the tickets of the same task that must be done before this one.
   */
  readonly dependsOn: readonly number[];

  /**
   * Identifier of the earlier ticket whose landed work this ticket fixes, or `null` for none.
   */
  readonly fixes: number | null;

  /**
   * Stage that the work of the ticket is in, `prototype`, `tests` or `refactor`, or `null` outside of the stages.
   */
  readonly stage: 'prototype' | 'tests' | 'refactor' | null;

  /**
   * Cause that a blocked ticket waits for, or `null` for a ticket that is not blocked.
   */
  readonly blockedReason: string | null;
}

/**
 * Changed file of the commit of a ticket, as `ChangedFile` of `mcp/src/worktree/worktrees.ts` declares it.
 */
export interface ChangedFile {
  /**
   * Path that names the file: its new path, or its old path for a deleted file.
   */
  readonly path: string;

  /**
   * Path before a rename or a copy, else `null`.
   */
  readonly oldPath: string | null;

  /**
   * What the commit did to the file.
   */
  readonly status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

  /**
   * Number of the added lines, as `git show --numstat` counts them. 0 for a binary file.
   */
  readonly additions: number;

  /**
   * Number of the deleted lines, as `git show --numstat` counts them. 0 for a binary file.
   */
  readonly deletions: number;

  /**
   * Whether git found the file binary.
   */
  readonly binary: boolean;

  /**
   * Whether the file is build output or minified.
   */
  readonly generated: boolean;

  /**
   * Section of the patch of `git show -M` for this file alone, from its `diff --git` line to the line before the next
   * file, with paths not quoted. `null` for a big file, whose section `ticketFileDiff` returns.
   */
  readonly patch: string | null;
}

/**
 * Changes of the commit that holds the landed work of a ticket, the result of `ticketDiff`, as `TicketChanges` of
 * `mcp/src/worktree/worktrees.ts` declares it.
 */
export interface TicketChanges {
  /**
   * Id of the commit.
   */
  readonly commit: string;

  /**
   * Changed files, in the order of `git show -M`.
   */
  readonly files: readonly ChangedFile[];
}

/**
 * Section of the patch of one changed file of the commit of a ticket, the result of `ticketFileDiff`.
 */
export interface TicketFilePatch {
  /**
   * Section of the patch of the file, in the same form as `ChangedFile.patch`.
   */
  readonly patch: string;
}

/**
 * Result of `ticketRequestChanges`, as `RequestedChanges` of `mcp/src/rpc/method.ticket-request-changes.ts`
 * declares it.
 */
export interface RequestedChanges {
  /**
   * New ticket that makes the changes that the review asked for.
   */
  readonly ticket: Ticket;

  /**
   * Why the server refused to approve the reviewed ticket, or `null` when it approved it, or when it was done already.
   */
  readonly approvalRefusal: string | null;
}

/**
 * Task of the repository in the result of `taskGet`, with the fields that the web app reads, as `Task` of
 * `mcp/src/storage/task-store.ts` declares it.
 */
export interface TaskDetail {
  /**
   * Identifier of the task.
   */
  readonly id: number;

  /**
   * Goals of the task in the order of their ids.
   */
  readonly goals: readonly Goal[];

  /**
   * Tickets of the task in the order of their ids.
   */
  readonly tickets: readonly Ticket[];
}

/**
 * Repository that the server serves, the result of `repositoryGet` of `mcp/src/rpc/method.repository-get.ts`.
 */
export interface Repository {
  /**
   * Name of the repository: the last segment of `directory`, such as `atomic-workflow-mcp`.
   */
  readonly name: string;

  /**
   * Absolute path of the main worktree of the repository.
   */
  readonly directory: string;
}

/**
 * Name of an event of the stream at `/events`: the resource that changed, `ChangedResource` of
 * `mcp/src/changes/change-feed.ts`. `sessions` is the set of attached sessions with the status of each, `messages` the
 * message log, and `tasks` the tasks with their goals, design and tickets.
 */
export type ChangeEvent = 'sessions' | 'messages' | 'tasks';

/**
 * Skill that a session can run, in the result of `skillList`, as `TranscriptSkill` of
 * `mcp/src/transcript/find-transcript.ts` declares it.
 */
export interface Skill {
  /**
   * Name of the skill, with the name of its plugin before a colon for the skill of a plugin, such as
   * `atomic-workflow:plan`.
   */
  readonly name: string;

  /**
   * What the skill does and when to use it, as the agent lists it.
   */
  readonly description: string;
}
