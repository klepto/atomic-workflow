import { parseArgs } from 'node:util';
import { Attach } from './attachment/attach.ts';
import { RepositoryAddress } from './attachment/repository-address.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';

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
  const address = await RepositoryAddress(process.cwd());
  const { connection } = await Attach(address, 'client', {
    launch: () => Promise.reject(new Error(`No atomic-workflow server runs at ${address}`)),
    openConnection: OpenRpcConnection,
    handle: (message) => Dispatch([], message),
  });
  try {
    const result = await connection.request(method, JSON.parse(params));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    connection.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
