import { parseArgs } from 'node:util';
import { ServeRepository } from './attachment/serve-repository.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { type MethodContext, Methods } from './rpc/method.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';
import { DatabasePath } from './storage/database-path.ts';
import { OpenStorage, type Storage } from './storage/open-storage.ts';
import { StartWebServer } from './web/start-web-server.ts';

/**
 * Serves as the repository server at the address that the argument `--address <address>` names, with a web server on
 * a free port of the local host. Clients call the methods of `Methods` at the address and on the web server alike.
 * The methods keep their data in the storage of the repository that holds the directory that the argument
 * `--directory <directory>` names. The process ends when the last session server leaves.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { address: { type: 'string' }, directory: { type: 'string' } } });
  if (values.address === undefined) throw new Error('The argument --address <address> is missing');
  if (values.directory === undefined) throw new Error('The argument --directory <directory> is missing');
  const storage = await OpenStorage(await DatabasePath(values.directory));
  try {
    await serve(values.address, storage);
  } finally {
    storage.close();
  }
};

/**
 * Serves as the repository server at `address`, with the stores of `storage`, until the last session server leaves.
 */
const serve = async (address: string, storage: Storage): Promise<void> => {
  const context: MethodContext = { sessions: storage.sessions, messageLog: storage.messageLog };
  const webServer = await StartWebServer((message) => Dispatch(Methods, context, message));
  try {
    await ServeRepository(address, webServer.url, Methods, context, {
      dispatch: Dispatch,
      openConnection: OpenRpcConnection,
    });
  } finally {
    await webServer.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
