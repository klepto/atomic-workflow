import { z } from 'zod';
import type { Method } from './method.ts';

/**
 * Schema of the parameters of `echo`.
 */
const PARAMS = z.object({ message: z.string().describe('Text to send back') });

/**
 * `Method` named `echo`, which returns the message that it receives.
 */
export const echoMethod: Method<typeof PARAMS, { readonly message: string }> = {
  name: 'echo',
  description:
    'Sends a message to the atomic-workflow server, which returns it unchanged. Use it to test the connection.',
  agent: true,
  params: PARAMS,
  handle: async ({ message }) => ({ message }),
};
