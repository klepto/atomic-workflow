import { createConnection, type Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import type { AttachFunction, Attachment } from './attach.ts';

/**
 * Time in ms between two tries to connect to a repository server that is coming up.
 */
const CONNECT_INTERVAL = 50;

/**
 * Time in ms that a launched repository server has to come up.
 */
const CONNECT_TIMEOUT = 5_000;

/**
 * `AttachFunction` that connects through a named pipe or a Unix domain socket. A repository server that another
 * session server launched at the same time serves as well as the one that `launch` starts.
 */
export const socketAttach: AttachFunction = async (address, launch) => {
  const socket = await connectCatching(address);
  if (!(socket instanceof Error)) return attachment(socket, false);
  await launch();
  return attachment(await connectUntil(address, Date.now() + CONNECT_TIMEOUT), true);
};

/**
 * Returns a connection to `address`, or the error of the try to connect.
 */
const connectCatching = (address: string): Promise<Socket | Error> => {
  return new Promise((resolve) => {
    const socket = createConnection(address);
    socket.once('error', resolve);
    socket.once('connect', () => {
      socket.off('error', resolve);
      resolve(socket);
    });
  });
};

/**
 * Returns a connection to `address`, and tries again until the time `deadline` in ms since the epoch.
 * If no try connects by then, throws the error of the last try.
 */
const connectUntil = async (address: string, deadline: number): Promise<Socket> => {
  for (;;) {
    const socket = await connectCatching(address);
    if (!(socket instanceof Error)) return socket;
    if (Date.now() >= deadline)
      throw new Error(`The repository server at ${address} did not come up: ${socket.message}`);
    await sleep(CONNECT_INTERVAL);
  }
};

/**
 * Returns the attachment of the connection `socket`.
 */
const attachment = (socket: Socket, launched: boolean): Attachment => {
  // An error of the connection is followed by its close, which `closed` reports.
  socket.on('error', () => {});
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  return { launched, closed };
};
