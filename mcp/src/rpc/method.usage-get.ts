import { z } from 'zod';
import type { UsageLimits } from '../usage/usage-limits.ts';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `usageGet`, which has none.
 */
const PARAMS = z.object({});

/**
 * `Method` named `usageGet`, which returns the latest usage limits of the account that the usage reader holds, from
 * the cache of Claude Code. It only reads, and sends no request to a model.
 */
export const usageGetMethod: Method<typeof PARAMS, UsageLimits> = {
  name: 'usageGet',
  description:
    'Returns the latest 5-hour and weekly usage limits of the account, as Claude Code caches them: the used percentage and the reset time of each window, and the time of the fetch.',
  agent: false,
  params: PARAMS,
  handle: async (_params, { usage }) => usage.latest(),
};
