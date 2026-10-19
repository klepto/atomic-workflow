import { rm } from 'node:fs/promises';
import { createConnection, createServer, type Server } from 'node:net';
import type { ServeRepositoryFunction } from './serve-repository.ts';

/**
 * Time in ms that a repository server waits for its first session server.
 */
const FIRST_ATTACH_TIMEOUT = 10_000;

/**
 * `ServeRepositoryFunction` that listens on a named pipe or a Unix domain socket and counts the open connections.
 * Each connection is one attached session server.
 */
export const socketServeRepository: ServeRepositoryFunction = async (address) => {
  const server = createServer();
  const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
  let attached = 0;
  let firstAttachTimer: NodeJS.Timeout | undefined;
  server.on('connection', (socket) => {
    clearTimeout(firstAttachTimer);
    attached += 1;
    // An error of the connection is followed by its close, which counts the session server as gone.
    socket.on('error', () => {});
    socket.once('close', () => {
      attached -= 1;
      if (attached === 0) server.close();
    });
  });
  await listenReclaiming(server, address);
  firstAttachTimer = setTimeout(() => server.close(), FIRST_ATTACH_TIMEOUT);
  await closed;
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
