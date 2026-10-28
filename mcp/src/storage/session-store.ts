/**
 * Agents that a session runs in.
 */
export const AGENTS = ['claude', 'codex'] as const;

/**
 * Agent of a session, one of `AGENTS`.
 */
export type Agent = (typeof AGENTS)[number];

/**
 * Roles of a session: `orchestrator` for a session that a user runs, and `subagent` for a subagent that runs inside an
 * orchestrator session.
 */
export const SESSION_ROLES = ['orchestrator', 'subagent'] as const;

/**
 * Role of a session, one of `SESSION_ROLES`.
 */
export type SessionRole = (typeof SESSION_ROLES)[number];

/**
 * Most characters that the alias of a session holds. An alias holds at least one character, and no line break.
 */
export const SESSION_ALIAS_MAX_LENGTH = 60;

/**
 * Session of an agent that the storage knows.
 */
export interface RegisteredSession {
  /**
   * Identifier of the session, as the agent gives it.
   */
  readonly id: string;

  /**
   * Agent that the session runs in.
   */
  readonly agent: Agent;

  /**
   * Absolute path of the directory of the project of the session.
   */
  readonly directory: string;

  /**
   * Time when the session was registered first, in ms since the epoch.
   */
  readonly startedAt: number;

  /**
   * Role of the session.
   */
  readonly role: SessionRole;

  /**
   * Identifier of the orchestrator session that a subagent runs inside, or `null` for an orchestrator session.
   */
  readonly parentId: string | null;

  /**
   * Identifier of the task that the session works on, or `null` for a session that was started for no task.
   */
  readonly taskId: number | null;

  /**
   * Job of a subagent, such as the skill that it was started to run, `plan` or `implement`, or `orchestrator` for the
   * orchestrator of a task. `null` for a session with no known job, such as an orchestrator session.
   */
  readonly job: string | null;

  /**
   * Identifier of the ticket of the task `taskId` that the session works on, or `null` for a session that works on no
   * ticket.
   */
  readonly ticketId: number | null;

  /**
   * Display name that a feature gave the session, or `null` for a session that no feature named. Aliases are not
   * unique.
   */
  readonly alias: string | null;
}

/**
 * Store of the sessions of a repository. A session stays registered until it is deleted.
 */
export interface SessionStore {
  /**
   * Registers `session`, and returns it as registered. A session with the identifier of `session` that is registered
   * already stays as it is, with its alias, and is returned instead.
   */
  register(session: RegisteredSession): Promise<RegisteredSession>;

  /**
   * Returns the session with the identifier `id`. If no such session is registered, returns `undefined` instead.
   */
  get(id: string): Promise<RegisteredSession | undefined>;

  /**
   * Returns every registered session, in the order of its start.
   */
  list(): Promise<RegisteredSession[]>;

  /**
   * Sets the task that the session `id` works on to `taskId`, and returns `true`. A session that works on a task
   * already keeps it. If no such session is registered, or it works on a task already, returns `false` instead.
   */
  setTask(id: string, taskId: number): Promise<boolean>;

  /**
   * Sets the ticket that the session `id` works on to `ticketId`, a ticket of the task that it works on, and returns
   * `true`. A session that works on a ticket already keeps it. If no such session is registered, it works on no task,
   * or it works on a ticket already, returns `false` instead.
   */
  setTicket(id: string, ticketId: number): Promise<boolean>;

  /**
   * Sets the alias of the session `id` to `alias`, or clears it for `null`, and returns `true`. If no such session is
   * registered, or it holds `alias` already, returns `false` instead.
   */
  setAlias(id: string, alias: string | null): Promise<boolean>;

  /**
   * Deletes the session `id` with its messages in the message log, and returns `true`. If no such session is
   * registered, returns `false` instead. Rejects for a session that another session runs inside.
   */
  delete(id: string): Promise<boolean>;
}
