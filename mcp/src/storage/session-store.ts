/**
 * Agents that a session runs in.
 */
export const AGENTS = ['claude', 'codex'] as const;

/**
 * Agent of a session, one of `AGENTS`.
 */
export type Agent = (typeof AGENTS)[number];

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
}

/**
 * Store of the sessions of a repository. A session stays registered for good.
 */
export interface SessionStore {
  /**
   * Registers `session`, and returns it as registered. A session with the identifier of `session` that is registered
   * already stays as it is, and is returned instead.
   */
  register(session: RegisteredSession): Promise<RegisteredSession>;

  /**
   * Returns the session with the identifier `id`. If no such session is registered, returns `undefined` instead.
   */
  get(id: string): Promise<RegisteredSession | undefined>;
}
