import { z } from 'zod';

/**
 * Version of the protocol between the repository server and its clients. A change that an older client or an older
 * repository server does not understand raises it.
 */
export const PROTOCOL_VERSION = 20;

/**
 * Name of the method that a client calls first on each connection to the repository server.
 */
export const HELLO_METHOD = 'hello';

/**
 * Schema of the parameters of `hello`.
 */
export const HELLO_PARAMS = z.object({
  protocol: z.number().int(),
  role: z.enum(['session', 'client']),
});

/**
 * Parameters of `hello`.
 */
export type HelloParams = z.output<typeof HELLO_PARAMS>;

/**
 * Role of a client of the repository server. A `session` is a session server, which keeps the repository server
 * alive while it stays connected. A `client`, such as a command line tool, does not.
 */
export type Role = HelloParams['role'];

/**
 * Schema of the result of `hello`.
 */
export const HELLO_RESULT = z.object({
  url: z.string(),
});

/**
 * Result of `hello`.
 */
export type HelloResult = z.output<typeof HELLO_RESULT>;
