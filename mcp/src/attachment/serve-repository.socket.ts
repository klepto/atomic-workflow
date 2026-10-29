import { rm } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import type { Method, MethodContext } from '../rpc/method.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { RpcError, RpcErrorCode } from '../rpc/rpc-error.ts';
import { BIND_SESSION_METHOD, BIND_SESSION_PARAMS } from './bind-session.ts';
import { HELLO_METHOD, HELLO_PARAMS, type HelloResult, PROTOCOL_VERSION } from './hello.ts';
import type { ServeRepositoryDependencies, ServeRepositoryFunction } from './serve-repository.ts';

/**
 * Time in ms that a repository server waits for its first session server.
 */
const FIRST_ATTACH_TIMEOUT = 10_000;

/**
 * State of a repository server.
 */
interface Repository {
  /**
   * Server that listens on the address.
   */
  readonly server: Server;

  /**
   * URL that `hello` returns.
   */
  readonly url: string;

  /**
   * Methods that clients call after `hello`.
   */
  readonly methods: readonly Method[];

  /**
   * Services that the methods run with.
   */
  readonly context: MethodContext;

  /**
   * Dependencies of the repository server.
   */
  readonly dependencies: ServeRepositoryDependencies;

  /**
   * Number of attached session servers.
   */
  sessions: number;

  /**
   * Timer that ends the repository server when no session server attaches in time, until one does.
   */
  firstAttachTimer: NodeJS.Timeout | undefined;
}

/**
 * `ServeRepositoryFunction` that listens on a named pipe or a Unix domain socket, and counts the connections that say
 * hello as a session server.
 */
export const socketServeRepository: ServeRepositoryFunction = async (address, url, methods, context, dependencies) => {
  const server = createServer();
  const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
  const repository: Repository = {
    server,
    url,
    methods,
    context,
    dependencies,
    sessions: 0,
    firstAttachTimer: undefined,
  };
  server.on('connection', (socket) => serve(repository, socket));
  await listenReclaiming(server, address);
  await dependencies.listening?.();
  repository.firstAttachTimer = setTimeout(() => server.close(), FIRST_ATTACH_TIMEOUT);
  await closed;
};

/**
 * Answers the requests of the client of `repository` on the new connection `socket`.
 */
const serve = (repository: Repository, socket: Socket): void => {
  const { dispatch, openConnection } = repository.dependencies;
  let session = false;
  const attachSession = (): void => {
    if (session) return;
    session = true;
    repository.sessions += 1;
    clearTimeout(repository.firstAttachTimer);
  };
  // An error of the connection is followed by its close, which counts the session server as gone.
  socket.once('close', () => {
    if (session) repository.sessions -= 1;
    if (session && repository.sessions === 0) repository.server.close();
  });
  const methods = [
    helloMethod(repository.url, attachSession),
    bindSessionMethod(() => (session ? connection : undefined)),
    ...repository.methods,
  ];
  // Each request names this connection as its caller. The handler only runs once `connection` is set.
  const connection: RpcConnection = openConnection(socket, (message) =>
    dispatch(methods, { ...repository.context, caller: connection }, message),
  );
};

/**
 * Returns the method `hello` of one connection, which returns `url`, and calls `attachSession` when the client says
 * hello as a session server.
 */
const helloMethod = (url: string, attachSession: () => void): Method<typeof HELLO_PARAMS, HelloResult> => {
  return {
    name: HELLO_METHOD,
    description: 'Opens the connection. A client calls it first.',
    agent: false,
    params: HELLO_PARAMS,
    handle: async ({ protocol, role }) => {
      if (protocol !== PROTOCOL_VERSION)
        throw new RpcError(
          RpcErrorCode.INVALID_PARAMS,
          `Protocol ${protocol} is not supported, only ${PROTOCOL_VERSION}`,
        );
      if (role === 'session') attachSession();
      return { url };
    },
  };
};

/**
 * Returns the method `bindSession` of one connection, which binds a session to the connection that
 * `sessionConnection` returns, and gives the session an inbox until the connection closes. The inbox of the session
 * that the connection served before moves to the new session, so a wait for its messages that is under way, such as
 * one from before `/clear`, receives the messages of the new session. Before the client says hello as a session
 * server, `sessionConnection` returns `undefined`, and the method fails.
 */
const bindSessionMethod = (
  sessionConnection: () => RpcConnection | undefined,
): Method<typeof BIND_SESSION_PARAMS, void> => {
  return {
    name: BIND_SESSION_METHOD,
    description: 'Binds a session to the connection, so that the repository server reaches the session over it.',
    agent: false,
    params: BIND_SESSION_PARAMS,
    handle: async ({ sessionId }, { sessionConnections, inboxes }) => {
      const connection = sessionConnection();
      if (connection === undefined)
        throw new RpcError(RpcErrorCode.INVALID_REQUEST, 'Only a session server can bind a session');
      const previous = sessionConnections.bind(sessionId, connection);
      if (previous !== undefined) inboxes.move(previous, sessionId);
      inboxes.open(sessionId, connection.closed);
    },
  };
};

/**
 * Starts `server` listening on `address`. A Unix domain socket that a crashed repository server left behind, and that
 * no process listens on, is removed first.
 * If another repository server listens on `address`, throws.
 */
const listenReclaiming = async (server: Server, address: string): Promise<void> => {
  const error = await listenCatching(server, address);
  if (error === undefined) return;
  if (error.code !== 'EADDRINUSE' || process.platform === 'win32' || (await isServed(address))) throw error;
  await rm(address, { force: true });
  const retryError = await listenCatching(server, address);
  if (retryError !== undefined) throw retryError;
};

/**
 * Starts `server` listening on `address`, and resolves once it listens. If it does not listen, resolves to the error
 * instead.
 */
const listenCatching = (server: Server, address: string): Promise<NodeJS.ErrnoException | undefined> => {
  return new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(address, () => {
      server.off('error', resolve);
      resolve(undefined);
    });
  });
};

/**
 * Returns whether a process listens on `address`.
 */
const isServed = (address: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = createConnection(address);
    socket.once('error', () => resolve(false));
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
  });
};
