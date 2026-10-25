import { z } from 'zod';
import type { TranscriptSkill } from '../transcript/find-transcript.ts';
import type { Method, MethodContext } from './method.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';
import { skillListSessionMethod } from './session-method.skill-list.ts';

/**
 * Name of the skill that attaches a session to the repository server. Every session that `skillList` serves is attached
 * already, and the skill run inside a subagent would wait for the messages of its orchestrator.
 */
const ACTIVATION_SKILL = 'atomic-workflow:atomic-workflow';

/**
 * Schema of the parameters of `skillList`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the attached session or subagent'),
});

/**
 * `Method` named `skillList`, which returns the skills that an attached session can run, as the transcript of its
 * orchestrator session lists them, in the order of the list. A subagent runs inside the process of its orchestrator, so
 * it gets the skills of its orchestrator. The skill that attaches a session is left out. A session that is not attached
 * fails with invalid parameters.
 */
export const skillListMethod: Method<typeof PARAMS, { readonly skills: readonly TranscriptSkill[] }> = {
  name: 'skillList',
  description: 'Returns the skills that an attached session or subagent of the repository can run.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId }, context) => {
    const orchestratorId = orchestratorOf(context, sessionId);
    const connection = orchestratorId === undefined ? undefined : context.sessionConnections.get(orchestratorId);
    if (orchestratorId === undefined || connection === undefined)
      throw new RpcError(RpcErrorCode.INVALID_PARAMS, `No session ${sessionId} is attached`);
    const params: z.input<typeof skillListSessionMethod.params> = { sessionId: orchestratorId };
    const { skills } = (await connection.request(skillListSessionMethod.name, params)) as {
      readonly skills: readonly TranscriptSkill[];
    };
    return { skills: skills.filter(({ name }) => name !== ACTIVATION_SKILL) };
  },
};

/**
 * Returns the id of the orchestrator session of the attached session `sessionId`, with the services of `context`: the
 * session itself for a bound session, and its parent for an attached subagent. If the session is neither, returns
 * `undefined` instead.
 */
const orchestratorOf = ({ sessionConnections, subagents }: MethodContext, sessionId: string): string | undefined => {
  if (sessionConnections.get(sessionId) !== undefined) return sessionId;
  return subagents.list().find((subagent) => subagent.sessionId === sessionId)?.parentId;
};
