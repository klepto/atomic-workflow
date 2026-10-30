import { rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { errorDetail } from '../entry/error-detail.ts';
import type { Method, MethodContext } from '../rpc/method.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { connectCatching } from './attach.socket.ts';
import { bindSessionMethod } from './bind-session.ts';
import { helloMethod } from './hello.ts';
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
   * Open connections of clients.
   */
  readonly connections: Set<Socket>;

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
    connections: new Set(),
    sessions: 0,
    firstAttachTimer: undefined,
  };
  server.on('connection', (socket) => serve(repository, socket));
  await listenReclaiming(server, address);
  // An error of a listening server, such as `EMFILE` on an accept, leaves it listening, so it keeps serving the
  // attached session servers. Without a listener, the error would crash the process with all its state.
  server.on('error', (error) => dependencies.log(`The repository server at ${address} failed: ${errorDetail(error)}`));
  try {
    await dependencies.listening?.();
  } catch (error) {
    // A repository server that keeps listening after a failed start would serve its session servers with a web
    // server and a storage that its caller closes, and keep the process alive. Once it stops, the next session server
    // launches a fresh one.
    server.close();
    for (const socket of repository.connections) socket.destroy();
    await closed;
    throw error;
  }
  repository.firstAttachTimer = setTimeout(() => server.close(), FIRST_ATTACH_TIMEOUT);
  await closed;
};

/**
 * Answers the requests of the client of `repository` on the new connection `socket`.
 */
const serve = (repository: Repository, socket: Socket): void => {
  const { dispatch, openConnection } = repository.dependencies;
  let session = false;
  const attachSession = (): boolean => {
    if (session) return true;
    // A closed listener never listens again, so a session server that attached here would keep a repository server
    // alive that no new session server reaches, while those launch another one.
    if (!repository.server.listening) {
      // The response to `hello` is sent before the next turn of the event loop, so it goes out before the end.
      setImmediate(() => connection.close());
      return false;
    }
    session = true;
    repository.sessions += 1;
    clearTimeout(repository.firstAttachTimer);
    return true;
  };
  repository.connections.add(socket);
  // An error of the connection is followed by its close, which counts the session server as gone.
  socket.once('close', () => {
    repository.connections.delete(socket);
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
 * Starts `server` listening on `address`. A Unix domain socket that a crashed repository server left behind, and that
 * no process listens on, is removed first.
 * If another repository server listens on `address`, throws.
 */
const listenReclaiming = async (server: Server, address: string): Promise<void> => {
  const error = await listenCatching(server, address);
  if (!(error instanceof Error)) return;
  if (error.code !== 'EADDRINUSE' || process.platform === 'win32' || (await isServed(address))) throw error;
  await rm(address, { force: true });
  const retryError = await listenCatching(server, address);
  if (retryError instanceof Error) throw retryError;
};

/**
 * Starts `server` listening on `address`, and resolves once it listens. If it does not listen, resolves to the error
 * instead.
 */
const listenCatching = async (server: Server, address: string): Promise<NodeJS.ErrnoException | undefined> =>
  new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(address, () => {
      server.off('error', resolve);
      resolve(undefined);
    });
  });

/**
 * Returns whether a process listens on `address`.
 */
const isServed = async (address: string): Promise<boolean> => {
  const socket = await connectCatching(address);
  if (socket instanceof Error) return false;
  socket.destroy();
  return true;
};
