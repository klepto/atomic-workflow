import type { RegisteredSession } from '../storage/session-store.ts';

/**
 * Fields of a session to register that its registration sets. Every other field of a new session is `null`.
 */
interface NewSessionFields
  extends Pick<RegisteredSession, 'id' | 'agent' | 'directory' | 'startedAt' | 'role' | 'parentId'> {
  /**
   * Identifier of the task that the session works on, or `null` or `undefined` for none.
   */
  readonly taskId?: number | null;

  /**
   * Job of the session, or `null` or `undefined` for none.
   */
  readonly job?: string | null;

  /**
   * Identifier of the ticket that the session works on, or `null` or `undefined` for none.
   */
  readonly ticketId?: number | null;

  /**
   * Alias of the session, which names its chat, or `null` or `undefined` for none.
   */
  readonly alias?: string | null;
}

/**
 * Returns the session to register with the fields `fields`. It has no context size, model or effort yet.
 */
export const newSession = ({
  id,
  agent,
  directory,
  startedAt,
  role,
  parentId,
  taskId = null,
  job = null,
  ticketId = null,
  alias = null,
}: NewSessionFields): RegisteredSession => ({
  id,
  agent,
  directory,
  startedAt,
  role,
  parentId,
  taskId,
  job,
  ticketId,
  alias,
  contextTokens: null,
  model: null,
  effort: null,
});
