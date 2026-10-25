/**
 * A session of the repository in the result of `sessionList`, as `ListedSession` of
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
   * Whether the session is attached, so it can take a message of `messageDeliver` now.
   */
  attached: boolean;
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
 * `mcp/src/changes/change-feed.ts`. `sessions` is the set of attached sessions, `messages` the message log, and `tasks`
 * the tasks with their goals, design and tickets.
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
