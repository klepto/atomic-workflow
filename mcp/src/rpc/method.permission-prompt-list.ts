import { z } from 'zod';
import type { PermissionPrompt } from '../attachment/permission-prompts.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `permissionPromptList`, which takes none.
 */
const PARAMS = z.object({});

/**
 * `Method` named `permissionPromptList`, which returns every open permission prompt, the oldest first. Agents do not
 * call it as a tool.
 */
export const permissionPromptListMethod: Method<typeof PARAMS, { readonly prompts: readonly PermissionPrompt[] }> = {
  name: 'permissionPromptList',
  description: 'Returns every open permission prompt, the oldest first.',
  agent: false,
  params: PARAMS,
  handle: async (_params, { prompts }) => ({ prompts: prompts.list() }),
};
