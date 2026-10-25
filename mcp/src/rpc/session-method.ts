import type { z } from 'zod';
import type { TranscriptSkill } from '../transcript/find-transcript.ts';
import type { Method } from './method.ts';
import { skillListSessionMethod } from './session-method.skill-list.ts';
import { subagentFollowMethod } from './session-method.subagent-follow.ts';

/**
 * Services of a session server that a method of the session server uses to do its work.
 */
export interface SessionMethodContext {
  /**
   * Starts to log the transcript of the subagent `sessionId`, which runs inside the session `parentId`, until the
   * subagent is stopped or the connection to the repository server closes. A failure of the log goes to the standard
   * error. If `parentId` is not the session that the agent runs now, throws.
   */
  followSubagent(sessionId: string, parentId: string): void;

  /**
   * Returns the skills that the agent of the session `sessionId` can run, as its transcript lists them so far, in the
   * order of the list. If `sessionId` is not the session that the agent runs now, throws.
   */
  listSkills(sessionId: string): readonly TranscriptSkill[];
}

/**
 * Methods that the repository server can call on a session server.
 */
export const SessionMethods: readonly Method<z.ZodObject, unknown, SessionMethodContext>[] = [
  subagentFollowMethod,
  skillListSessionMethod,
];
