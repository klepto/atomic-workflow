import { parseArgs } from 'node:util';
import { ServeRepository } from './attachment/serve-repository.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { Methods } from './rpc/method.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';
import { StartWebServer } from './web/start-web-server.ts';

/**
 * Serves as the repository server at the address that the argument `--address <address>` names, with a web server on
 * a free port of the local host. Clients call the methods of `Methods` at the address and on the web server alike.
 * The process ends when the last session server leaves.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { address: { type: 'string' } } });
  if (values.address === undefined) throw new Error('The argument --address <address> is missing');
  const webServer = await StartWebServer((message) => Dispatch(Methods, message));
  try {
    await ServeRepository(values.address, webServer.url, Methods, {
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
