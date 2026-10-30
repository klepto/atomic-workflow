import { parseArgs } from 'node:util';
import { socketAttach } from './attachment/attach.socket.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { attachClient } from './client/attach-client.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';

/**
 * Usage of the command line tool.
 */
const USAGE = 'Usage: node src/cli.main.ts <method> [<params as JSON>]';

/**
 * Calls the method that the first argument names, with the parameters of the JSON object in the second argument, on
 * the repository server of the repository that holds the working directory, and prints its result as JSON. The
 * repository server must run already, and the call does not keep it alive.
 */
const main = async (): Promise<void> => {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [method, params = '{}'] = positionals;
  if (method === undefined || positionals.length > 2) throw new Error(USAGE);
  const { connection } = await attachClient(process.cwd(), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
  });
  try {
    const result = await connection.request(method, JSON.parse(params));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    connection.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
});
