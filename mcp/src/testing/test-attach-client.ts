import type { AttachDependencies } from '../attachment/attach.ts';
import type { Role } from '../attachment/hello.ts';
import type { AttachClientDependencies } from '../client/attach-client.ts';
import { type TestConnection, testConnection } from './test-connection.ts';

/**
 * URL of the web server that the attachment of a `TestAttachClient` names.
 */
export const TEST_ATTACH_URL = 'http://127.0.0.1:4000/';

/**
 * Call of the `attach` of a `TestAttachClient`.
 */
export interface TestAttach {
  /**
   * Address that the client attaches to.
   */
  readonly address: string;

  /**
   * Role that the client attaches in.
   */
  readonly role: Role;

  /**
   * Dependencies that the client passed to the attach.
   */
  readonly dependencies: AttachDependencies;
}

/**
 * Options of a `TestAttachClient`.
 */
export interface TestAttachClientOptions {
  /**
   * Error that `repositoryAddress` rejects with, for a directory outside of a repository, or `undefined` for none.
   */
  readonly addressError?: Error;

  /**
   * Error that `attach` rejects with, such as a `NoRepositoryServerError`, or `undefined` for none.
   */
  readonly attachError?: Error;
}

/**
 * Dependencies of the attach of a client for a test, with the connection that the attach returns and the calls of the
 * attach.
 */
export interface TestAttachClient {
  /**
   * Dependencies of the attach of a client.
   */
  readonly dependencies: AttachClientDependencies;

  /**
   * Connection that each attach returns.
   */
  readonly connection: TestConnection;

  /**
   * Calls of `attach`, in order.
   */
  readonly attaches: readonly TestAttach[];

  /**
   * Messages that `dispatch` received, in order.
   */
  readonly dispatched: readonly unknown[];
}

/**
 * Returns a `TestAttachClient`, whose `repositoryAddress` returns `<directory>/repository.sock` and whose `attach`
 * returns an attachment that it did not launch, with `TEST_ATTACH_URL` and a `testConnection`, both unless an error of
 * `options` makes them reject. `openConnection` throws, since no test opens a stream, and `dispatch` answers each
 * message with `undefined`.
 */
export const testAttachClient = (options: TestAttachClientOptions = {}): TestAttachClient => {
  const connection = testConnection();
  const attaches: TestAttach[] = [];
  const dispatched: unknown[] = [];
  return {
    connection,
    attaches,
    dispatched,
    dependencies: {
      repositoryAddress: async (directory) => {
        if (options.addressError !== undefined) throw options.addressError;
        return `${directory}/repository.sock`;
      },
      attach: async (address, role, dependencies) => {
        attaches.push({ address, role, dependencies });
        if (options.attachError !== undefined) throw options.attachError;
        return { launched: false, url: TEST_ATTACH_URL, connection };
      },
      openConnection: () => {
        throw new Error('The test opens no connection');
      },
      dispatch: async (_methods, _context, message) => {
        dispatched.push(message);
        return undefined;
      },
    },
  };
};
