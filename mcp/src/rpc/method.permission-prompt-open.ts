import { z } from 'zod';
import type { PermissionAnswer, PermissionSuggestion } from '../attachment/permission-prompts.ts';
import { callMethod } from './call-method.ts';
import type { Method, MethodContext } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { subagentTaskIdSessionMethod } from './session-method.subagent-task-id.ts';

/**
 * Schema of the parameters of `permissionPromptOpen`.
 */
const PARAMS = z.object({
  sessionId: z.string().min(1).describe('Identifier of the Claude Code session that asks, `session_id` of the hook'),
  agentId: z.string().nullable().describe('Identifier of the subagent that asks, `agent_id` of the hook, or null'),
  agentType: z.string().nullable().describe('Type of the subagent that asks, `agent_type` of the hook, or null'),
  toolName: z.string().min(1).describe('Name of the tool of the call'),
  toolInput: z.unknown().describe('Input of the tool call, as Claude Code gave it'),
  suggestions: z
    .array(z.unknown())
    .describe('Suggestions of Claude Code for an always-allow answer, `permission_suggestions` of the hook'),
});

/**
 * `Method` named `permissionPromptOpen`, which opens a permission prompt of the session `sessionId`, or of its
 * subagent whose background task id is `agentId`, and returns the answer once the web app gives one. A subagent that
 * the repository server cannot resolve shows under `sessionId`. A suggestion that is no object is left out. When the
 * connection of the caller closes before an answer, the prompt closes, and the call rejects with a response that goes
 * nowhere. A caller without a connection fails with an invalid request, and opens no prompt. Agents do not call it as
 * a tool.
 */
export const permissionPromptOpenMethod: Method<typeof PARAMS, PermissionAnswer> = {
  name: 'permissionPromptOpen',
  description: 'Opens a permission prompt of a session, and waits for the answer of the web app.',
  agent: false,
  params: PARAMS,
  handle: async ({ sessionId, agentId, agentType, toolName, toolInput, suggestions }, context) => {
    const { caller } = context;
    if (caller === undefined)
      throw new RpcError(
        RPC_ERROR_CODES.INVALID_REQUEST,
        'Only a client that is connected to the repository server can open a permission prompt',
      );
    const askingId = agentId === null ? sessionId : ((await subagentOf(sessionId, agentId, context)) ?? sessionId);
    const { answer } = context.prompts.open(
      {
        sessionId: askingId,
        agentType,
        toolName,
        toolInput,
        suggestions: suggestions.filter(isSuggestion),
        openedAt: context.clock.now(),
      },
      caller.closed,
    );
    const answered = await answer;
    if (answered === undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, 'The prompt closed before an answer');
    return answered;
  },
};

/**
 * Returns whether `value` is a suggestion that the web app can show and send back: an object that is no array.
 */
const isSuggestion = (value: unknown): value is PermissionSuggestion =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Returns the session id of the attached subagent of the session `parentId` whose background task id is `agentId`,
 * with the services of `context`: the session server of `parentId` knows the background task of each subagent that it
 * follows. If the session server is not attached, knows no such task, or a request to it fails, returns `undefined`
 * instead.
 */
const subagentOf = async (parentId: string, agentId: string, context: MethodContext): Promise<string | undefined> => {
  const connection = context.sessionConnections.get(parentId);
  if (connection === undefined) return undefined;
  const children = context.subagents.list().filter((subagent) => subagent.parentId === parentId);
  const taskIds = await Promise.all(
    children.map(({ sessionId }) =>
      callMethod(subagentTaskIdSessionMethod, { sessionId }, connection).then(
        ({ backgroundTaskId }) => backgroundTaskId,
        // A session server that cannot answer leaves the prompt under its session, where the user still sees it.
        () => null,
      ),
    ),
  );
  return children.find((_, index) => taskIds[index] === agentId)?.sessionId;
};
