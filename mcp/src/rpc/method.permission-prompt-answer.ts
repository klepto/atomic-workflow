import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { PermissionAnswer, PermissionPrompt, PermissionSuggestion } from '../attachment/permission-prompts.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Message that the agent reads when the user denies its tool call in the web app.
 */
const DENY_MESSAGE = 'Denied in the atomic-workflow web app.';

/**
 * Message of the failure to answer a prompt that is not open, which the web app recognizes.
 */
const NOT_OPEN_MESSAGE = 'The prompt is no longer open.';

/**
 * Schema of the parameters of `permissionPromptAnswer`.
 */
const PARAMS = z.object({
  promptId: z.string().min(1).describe('Identifier of the open prompt'),
  behavior: z.enum(['allow', 'deny']).describe('Answer: allow the tool call, or deny it'),
  suggestion: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Suggestion of the prompt to keep as a rule, for always allow, left out for allow once and deny'),
});

/**
 * `Method` named `permissionPromptAnswer`, which answers the open permission prompt `promptId`: `allow` once, `allow`
 * with one of its suggestions to keep, or `deny` with a fixed message. The prompt then closes. A prompt that is not
 * open fails with invalid parameters and the message `The prompt is no longer open.`. A suggestion with `deny`, or one
 * that the prompt does not have, fails with invalid parameters, and leaves the prompt open. Agents do not call it as a
 * tool.
 */
export const permissionPromptAnswerMethod: Method<typeof PARAMS, void> = {
  name: 'permissionPromptAnswer',
  description: 'Answers an open permission prompt with allow, allow with a suggestion to keep, or deny.',
  agent: false,
  params: PARAMS,
  handle: async ({ promptId, behavior, suggestion }, { prompts }) => {
    const prompt = prompts.get(promptId);
    if (prompt === undefined) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, NOT_OPEN_MESSAGE);
    // No await separates the lookup from the answer, so the prompt is still open here.
    prompts.answer(promptId, answerOf(prompt, behavior, suggestion));
  },
};

/**
 * Returns the answer to `prompt` for `behavior` and `suggestion`, with the suggestion of `prompt` that equals
 * `suggestion`. A suggestion with `deny`, or one that `prompt` does not have, fails with invalid parameters.
 */
const answerOf = (
  prompt: PermissionPrompt,
  behavior: 'allow' | 'deny',
  suggestion: PermissionSuggestion | undefined,
): PermissionAnswer => {
  if (behavior === 'deny') {
    if (suggestion !== undefined)
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'A deny answer takes no suggestion');
    return { behavior, message: DENY_MESSAGE };
  }
  if (suggestion === undefined) return { behavior };
  const kept = prompt.suggestions.find((candidate) => isDeepStrictEqual(candidate, suggestion));
  if (kept === undefined) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, 'The suggestion is not one of the prompt');
  return { behavior, updatedPermissions: [kept] };
};
