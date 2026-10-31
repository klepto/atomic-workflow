import type { RegisteredSession } from '../storage/session-store.ts';
import type { MethodContext } from './method.ts';
import { newSession } from './new-session.ts';

/**
 * Work of a new subagent, which names its chat.
 */
interface SubagentWork {
  /**
   * Identifier of the task that the subagent works on, or `null` for none.
   */
  readonly taskId: number | null;

  /**
   * Job of the subagent, or `null` for none.
   */
  readonly job: string | null;

  /**
   * Identifier of the ticket that the subagent works on, or `null` for none.
   */
  readonly ticketId: number | null;

  /**
   * Alias of the subagent, which names its chat, or `null` for none yet.
   */
  readonly alias: string | null;
}

/**
 * Registers a new subagent of the orchestrator session `parent`, which does the work `work`, with the services of
 * `context`, and returns its session id. The subagent runs in the agent and the directory of `parent`, and starts now.
 * Rejects as the session store of `context` does.
 */
export const registerSubagent = async (
  parent: RegisteredSession,
  work: SubagentWork,
  context: MethodContext,
): Promise<string> => {
  const sessionId = context.createSessionId();
  const { agent, directory } = parent;
  const startedAt = context.clock.now();
  await context.sessions.register(
    newSession({ id: sessionId, agent, directory, startedAt, role: 'subagent', parentId: parent.id, ...work }),
  );
  return sessionId;
};
