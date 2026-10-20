import { z } from 'zod';

/**
 * Name of the method that a session server calls each time the agent of its session moves on to a session, so that
 * the repository server reaches that session over the connection.
 */
export const BIND_SESSION_METHOD = 'bindSession';

/**
 * Schema of the parameters of `bindSession`.
 */
export const BIND_SESSION_PARAMS = z.object({
  sessionId: z.string().min(1),
});

/**
 * Parameters of `bindSession`.
 */
export type BindSessionParams = z.output<typeof BIND_SESSION_PARAMS>;
