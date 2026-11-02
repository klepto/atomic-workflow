import { fetchCall } from '@/api/rpc.fetch.ts';
import { type CallFunction, RpcCallError } from '@/api/rpc.ts';
import type { PermissionSuggestion } from '@/api/types.ts';

/**
 * Answer of the user to a permission prompt: allow once, always allow by one of the suggestions of the prompt, or deny.
 */
export type PromptAnswer =
  | { readonly behavior: 'allow'; readonly suggestion?: PermissionSuggestion }
  | { readonly behavior: 'deny' };

/**
 * Adapters that `answerPrompt` needs.
 */
interface AnswerPromptDependencies {
  /**
   * Sends each call to the server.
   */
  readonly call: CallFunction;
}

/**
 * Adapters of the page: each call goes to the web server with `fetch`.
 */
const PAGE_DEPENDENCIES: AnswerPromptDependencies = { call: fetchCall };

/**
 * Message of the refusal of `permissionPromptAnswer` for a prompt that is gone, such as one that the terminal answered
 * first, without its final period, so that the check holds with the period or without it.
 */
const GONE_MESSAGE = 'The prompt is no longer open';

/**
 * Returns whether the failure `error` is the refusal of `permissionPromptAnswer` for a prompt that is gone.
 */
const isGone = (error: unknown): boolean =>
  error instanceof RpcCallError && error.message.replace(/\.$/, '') === GONE_MESSAGE;

/**
 * Answers the open permission prompt `promptId` with `answer` through `permissionPromptAnswer`: allow once, always
 * allow with its suggestion unchanged, or deny. Each call goes through `call` of `dependencies`, which posts to the web
 * server by default. Returns `true` once the server took the answer, and `false` when the prompt is gone already, such
 * as when the terminal answered it first. Rejects with any other failure of the call.
 */
export const answerPrompt = async (
  promptId: string,
  answer: PromptAnswer,
  dependencies: AnswerPromptDependencies = PAGE_DEPENDENCIES,
): Promise<boolean> => {
  try {
    await dependencies.call('permissionPromptAnswer', { promptId, ...answer });
    return true;
  } catch (error) {
    if (isGone(error)) return false;
    throw error;
  }
};
