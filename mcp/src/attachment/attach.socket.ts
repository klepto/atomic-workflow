import { createConnection, type Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { AttachDependencies, AttachFunction, Attachment } from './attach.ts';
import { HELLO_METHOD, HELLO_RESULT, type HelloParams, PROTOCOL_VERSION, type Role } from './hello.ts';

/**
 * Time in ms between two tries to connect to a repository server that is coming up.
 */
const CONNECT_INTERVAL = 50;

/**
 * Time in ms that a launched repository server has to come up.
 */
const CONNECT_TIMEOUT = 5_000;

/**
 * Time in ms that a repository server has to answer `hello` on a new connection.
 */
const HELLO_TIMEOUT = 5_000;

/**
 * `AttachFunction` that connects through a named pipe or a Unix domain socket. A repository server that another
 * session server launched at the same time serves as well as the one that `launch` starts.
 */
export const socketAttach: AttachFunction = async (address, role, dependencies) => {
  const socket = await connectCatching(address);
  if (!(socket instanceof Error)) return attachment(socket, role, false, dependencies);
  await dependencies.launch();
  return attachment(await connectUntil(address, Date.now() + CONNECT_TIMEOUT), role, true, dependencies);
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
 * Returns the attachment of the connection `socket` in the role `role`, once the repository server has answered
 * `hello`. If the answer does not come in time or is not valid, ends the connection and throws.
 */
const attachment = async (
  socket: Socket,
  role: Role,
  launched: boolean,
  dependencies: AttachDependencies,
): Promise<Attachment> => {
  const connection = dependencies.openConnection(socket, dependencies.handle);
  try {
    return { launched, url: await hello(connection, role), connection };
  } catch (error) {
    socket.destroy();
    throw error;
  }
};

/**
 * Says hello over `connection` in the role `role`, and returns the URL of the web server that the repository server
 * answers with.
 * If the answer does not come within `HELLO_TIMEOUT` or is not valid, throws.
 */
const hello = async (connection: RpcConnection, role: Role): Promise<string> => {
  const params: HelloParams = { protocol: PROTOCOL_VERSION, role };
  const result = await connection.request(HELLO_METHOD, params, AbortSignal.timeout(HELLO_TIMEOUT));
  const parsed = HELLO_RESULT.safeParse(result);
  if (!parsed.success) throw new Error(`The repository server answered hello with ${JSON.stringify(result)}`);
  return parsed.data.url;
};
