import { type AttachFunction, type Attachment, NoRepositoryServerError } from '../attachment/attach.ts';
import type { RepositoryAddressFunction } from '../attachment/repository-address.ts';
import type { DispatchFunction } from '../rpc/dispatch.ts';
import type { OpenRpcConnectionFunction } from '../rpc/rpc-connection.ts';

/**
 * Dependencies of the attach of a client, such as a command line tool or a hook.
 */
export interface AttachClientDependencies {
  /**
   * Function that returns the address of the repository server.
   */
  readonly repositoryAddress: RepositoryAddressFunction;

  /**
   * Function that connects to the repository server.
   */
  readonly attach: AttachFunction;

  /**
   * Function that opens the JSON-RPC 2.0 connection to the repository server.
   */
  readonly openConnection: OpenRpcConnectionFunction;

  /**
   * Function that answers the requests of the repository server, of which a client offers no method.
   */
  readonly dispatch: DispatchFunction;
}

/**
 * Returns the attachment of a client to the repository server of the repository that holds `directory`, which the
 * client does not start, with `dependencies`. A client offers the repository server no method.
 * If `directory` is not in a repository, rejects as `RepositoryAddressFunction` says, and if no repository server
 * runs, rejects with a `NoRepositoryServerError`. Else rejects as `AttachFunction` says.
 */
export const attachClient = async (directory: string, dependencies: AttachClientDependencies): Promise<Attachment> =>
  attachAt(await dependencies.repositoryAddress(directory), dependencies);

/**
 * Returns the attachment of a client to the repository server of the repository that holds `directory`, as
 * `attachClient` does. If `directory` is not in a repository, or no repository server runs, returns `undefined`
 * instead. Else rejects as `AttachFunction` says.
 */
export const attachRunningClient = async (
  directory: string,
  dependencies: AttachClientDependencies,
): Promise<Attachment | undefined> => {
  // A directory outside of a git repository has no repository server.
  const address = await dependencies.repositoryAddress(directory).catch(() => undefined);
  if (address === undefined) return undefined;
  return attachAt(address, dependencies).catch((error: unknown) =>
    error instanceof NoRepositoryServerError ? undefined : Promise.reject(error),
  );
};

/**
 * Returns the attachment of a client to the repository server at `address`, with `dependencies`, and rejects as
 * `AttachFunction` says without a launch.
 */
const attachAt = async (address: string, dependencies: AttachClientDependencies): Promise<Attachment> =>
  dependencies.attach(address, 'client', {
    openConnection: dependencies.openConnection,
    handle: (message) => dependencies.dispatch([], undefined, message),
  });
