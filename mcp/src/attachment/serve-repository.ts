import type { DispatchFunction } from '../rpc/dispatch.ts';
import type { Method, MethodContext } from '../rpc/method.ts';
import type { OpenRpcConnectionFunction } from '../rpc/rpc-connection.ts';
import type { LogFunction } from '../session/log.ts';

/**
 * Dependencies of a repository server.
 */
export interface ServeRepositoryDependencies {
  /**
   * Function that runs each request of a client with its method.
   */
  readonly dispatch: DispatchFunction;

  /**
   * Function that opens a JSON-RPC 2.0 connection over each connection of a client.
   */
  readonly openConnection: OpenRpcConnectionFunction;

  /**
   * Function that runs once the repository server listens on its address, or `undefined` for none. A repository server
   * that another one keeps from listening never runs it.
   */
  readonly listening?: () => Promise<void>;

  /**
   * Function that writes a diagnostic, such as an error of the listening server, which the repository server survives.
   */
  readonly log: LogFunction;
}

/**
 * Function that serves as the repository server at `address`. Each client calls `hello` first, which returns `url`,
 * and then the methods of `methods`, which run with the services of `context`. A client counts as an attached session
 * server once it says hello in the role `session`. An attached session server calls `bindSession` for each session
 * that it serves, which binds the session to its connection in the session connections of `context`, and gives it an
 * inbox in the inboxes of `context`. Once it listens on `address`, it runs `listening` of `dependencies`.
 * It stops listening when the last attached session server leaves, or when no session server attaches in its first
 * seconds, and resolves once every connection that is still open has ended, those of other clients included. Once it
 * stops listening, `hello` in the role `session` fails with `REPOSITORY_CLOSING`, and the connection ends. An error
 * of the server once it listens goes to `log` of `dependencies`, and the repository server keeps serving.
 * If another repository server serves `address` already, rejects. If `listening` rejects, stops listening, ends each
 * open connection, and rejects with its reason once every connection has closed.
 */
export type ServeRepositoryFunction = (
  address: string,
  url: string,
  methods: readonly Method[],
  context: MethodContext,
  dependencies: ServeRepositoryDependencies,
) => Promise<void>;
