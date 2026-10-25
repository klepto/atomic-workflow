import { Attach } from './attachment/attach.ts';
import { RepositoryAddress } from './attachment/repository-address.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';

/**
 * Prints the URL of the web server of the repository server of the repository that holds the working directory, such
 * as `http://127.0.0.1:54614/`. The repository server must run already, and the call does not keep it alive.
 */
const main = async (): Promise<void> => {
  const address = await RepositoryAddress(process.cwd());
  const { url, connection } = await Attach(address, 'client', {
    launch: () => Promise.reject(new Error(`No atomic-workflow server runs at ${address}`)),
    openConnection: OpenRpcConnection,
    handle: (message) => Dispatch([], undefined, message),
  });
  connection.close();
  process.stdout.write(`${url}\n`);
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
