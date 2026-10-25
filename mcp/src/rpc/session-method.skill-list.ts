import { z } from 'zod';
import type { TranscriptSkill } from '../transcript/find-transcript.ts';
import type { Method } from './method.ts';
import type { SessionMethodContext } from './session-method.ts';

/**
 * Schema of the parameters of `skillList` of a session server.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the session that the agent runs now'),
});

/**
 * `Method` named `skillList` of a session server, which returns the skills that the agent of its session can run, as
 * the transcript of the session lists them so far.
 */
export const skillListSessionMethod: Method<
  typeof PARAMS,
  { readonly skills: readonly TranscriptSkill[] },
  SessionMethodContext
> = {
  name: 'skillList',
  description: 'Returns the skills that the agent of the session can run.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, { listSkills }) => ({ skills: listSkills(sessionId) }),
};
