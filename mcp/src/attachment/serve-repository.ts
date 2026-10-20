import type { DispatchFunction } from '../rpc/dispatch.ts';
import type { Method, MethodContext } from '../rpc/method.ts';
import type { OpenRpcConnectionFunction } from '../rpc/rpc-connection.ts';
import { socketServeRepository } from './serve-repository.socket.ts';

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
}

/**
 * Function that serves as the repository server at `address`, and resolves when the last session server that
 * attached to it leaves. Each client calls `hello` first, which returns `url`, and then the methods of `methods`,
 * which run with the services of `context`. A client counts as an attached session server once it says hello in the
 * role `session`. An attached session server calls `bindSession` for each session that it serves, which binds the
 * session to its connection in the session connections of `context`. A repository server that no session server
 * attaches to in its first seconds ends as well.
 * If another repository server serves `address` already, rejects.
 */
export type ServeRepositoryFunction = (
  address: string,
  url: string,
  methods: readonly Method[],
  context: MethodContext,
  dependencies: ServeRepositoryDependencies,
) => Promise<void>;

/**
 * Default `ServeRepositoryFunction`, which listens on a named pipe or a Unix domain socket.
 */
export const ServeRepository: ServeRepositoryFunction = socketServeRepository;
