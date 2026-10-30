import { socketAttach } from './attachment/attach.socket.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { attachClient } from './client/attach-client.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';

/**
 * Prints the URL of the web server of the repository server of the repository that holds the working directory, such
 * as `http://127.0.0.1:54614/`. The repository server must run already, and the call does not keep it alive.
 */
const main = async (): Promise<void> => {
  const { url, connection } = await attachClient(process.cwd(), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
  });
  connection.close();
  process.stdout.write(`${url}\n`);
};

await main().catch((error: unknown) => {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
});
