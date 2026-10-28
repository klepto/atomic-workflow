import type { z } from 'zod';
import type { TranscriptSkill } from '../transcript/find-transcript.ts';
import type { Method } from './method.ts';
import { skillListSessionMethod } from './session-method.skill-list.ts';
import { subagentFollowMethod } from './session-method.subagent-follow.ts';
import { subagentTaskIdMethod } from './session-method.subagent-task-id.ts';

/**
 * Services of a session server that a method of the session server uses to do its work.
 */
export interface SessionMethodContext {
  /**
   * Starts to log the transcript of the subagent `sessionId`, which runs inside the session `parentId`, until the
   * subagent is stopped or the connection to the repository server closes. A one-shot subagent, which the agent starts
   * after the call, is also logged until it finishes its prompt. A failure of the log goes to the standard error. If
   * `parentId` is not the session that the agent runs now, throws.
   */
  followSubagent(sessionId: string, parentId: string, oneShot: boolean): void;

  /**
   * Returns the skills that the agent of the session `sessionId` can run, as its transcript lists them so far, in the
   * order of the list. If `sessionId` is not the session that the agent runs now, throws.
   */
  listSkills(sessionId: string): readonly TranscriptSkill[];

  /**
   * Returns the id of the background task that runs the subagent `sessionId` of the session, by which the agent of the
   * session stops it. If the transcript of the subagent is not logged, or no background task runs it, returns
   * `undefined` instead.
   */
  subagentTaskId(sessionId: string): string | undefined;
}

/**
 * Methods that the repository server can call on a session server.
 */
export const SessionMethods: readonly Method<z.ZodObject, unknown, SessionMethodContext>[] = [
  subagentFollowMethod,
  skillListSessionMethod,
  subagentTaskIdMethod,
];
