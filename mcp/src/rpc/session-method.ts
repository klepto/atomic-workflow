import type { z } from 'zod';
import type { Method } from './method.ts';
import { deliverMethod } from './session-method.deliver.ts';
import { followSubagentMethod } from './session-method.follow-subagent.ts';

/**
 * Services of a session server that a method of the session server uses to do its work.
 */
export interface SessionMethodContext {
  /**
   * Puts the message `content` into the chat of the session as a new event, which the agent sees also while the
   * session is idle. Resolves once the message is sent to the agent, which does not confirm it.
   */
  pushMessage(content: string): Promise<void>;

  /**
   * Starts to log the transcript of the subagent `sessionId`, which runs inside the session `parentId`, until the
   * subagent finishes or the connection to the repository server closes. A failure of the log goes to the standard
   * error. If `parentId` is not the session that the agent runs now, throws.
   */
  followSubagent(sessionId: string, parentId: string): void;
}

/**
 * Methods that the repository server can call on a session server.
 */
export const SessionMethods: readonly Method<z.ZodObject, unknown, SessionMethodContext>[] = [
  deliverMethod,
  followSubagentMethod,
];
