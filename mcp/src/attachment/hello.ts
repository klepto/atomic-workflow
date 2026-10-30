import { z } from 'zod';
import type { Method } from '../rpc/method.ts';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';

/**
 * Version of the protocol between the repository server and its clients. A change that an older client or an older
 * repository server does not understand raises it.
 */
export const PROTOCOL_VERSION = 21;

/**
 * Name of the method that a client calls first on each connection to the repository server.
 */
export const HELLO_METHOD = 'hello';

/**
 * Code of the failure of `hello` in the role `session` on a repository server that no longer listens on its address,
 * since it is closing. One of the codes that JSON-RPC 2.0 leaves to the server.
 */
export const REPOSITORY_CLOSING = -32000;

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

/**
 * Returns whether `error` is the failure of `hello` on a repository server that is closing.
 */
export const isRepositoryClosing = (error: unknown): error is RpcError =>
  error instanceof RpcError && error.code === REPOSITORY_CLOSING;

/**
 * Returns the method `hello` of one connection, which returns `url`, and calls `attachSession` when the client says
 * hello in the role `session`. `attachSession` returns whether the session server attached, which it does not on a
 * repository server that is closing. The method fails with `INVALID_PARAMS` for a protocol other than
 * `PROTOCOL_VERSION`, and with `REPOSITORY_CLOSING` when `attachSession` returns `false`.
 */
export const helloMethod = (url: string, attachSession: () => boolean): Method<typeof HELLO_PARAMS, HelloResult> => ({
  name: HELLO_METHOD,
  description: 'Opens the connection. A client calls it first.',
  agent: false,
  params: HELLO_PARAMS,
  handle: async ({ protocol, role }) => {
    if (protocol !== PROTOCOL_VERSION) {
      const message = `Protocol ${protocol} is not supported, only ${PROTOCOL_VERSION}`;
      throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, message);
    }
    if (role === 'session' && !attachSession())
      throw new RpcError(REPOSITORY_CLOSING, 'The repository server is closing, and attaches no session server');
    return { url };
  },
});
