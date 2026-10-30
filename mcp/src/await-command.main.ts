import { parseArgs } from 'node:util';
import type { z } from 'zod';
import { socketAttach } from './attachment/attach.socket.ts';
import { shellAwaitCommandLine } from './attachment/await-command-line.shell.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { attachClient } from './client/attach-client.ts';
import { awaitReport } from './client/await-report.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { type AwaitCommandResult, inboxAwaitCommandMethod } from './rpc/method.inbox-await-command.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';

/**
 * Usage of the command line tool.
 */
const USAGE = 'Usage: node await-command.mjs <session id> [--after <number of the last message received>]';

/**
 * Waits for the next messages of the session that the first argument names, on the repository server of the
 * repository that holds the working directory, and prints them for the agent of the session, which runs this tool in
 * the background, so that its end wakes the agent. The output tells the agent what to do, and names the command line
 * of the next wait, which acknowledges the printed messages. The repository server must run already, and the wait does
 * not keep it alive.
 */
const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({ options: { after: { type: 'string' } }, allowPositionals: true });
  const [sessionId] = positionals;
  const after = values.after === undefined ? 0 : Number(values.after);
  if (sessionId === undefined || positionals.length > 1 || !Number.isSafeInteger(after) || after < 0)
    throw new Error(USAGE);
  const { connection } = await attachClient(process.cwd(), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
  });
  try {
    const params: z.input<typeof inboxAwaitCommandMethod.params> = { sessionId, after };
    const result = (await connection.request(inboxAwaitCommandMethod.name, params)) as AwaitCommandResult;
    const report = awaitReport(
      result,
      { entryPoint: import.meta.filename },
      { awaitCommandLine: shellAwaitCommandLine },
    );
    process.stdout.write(`${report}\n`);
  } finally {
    connection.close();
  }
};

// The agent reads the output of the tool, so a failure goes to the standard output as well.
await main().catch((error: unknown) => {
  process.stdout.write(
    `The wait for the messages of the atomic-workflow server failed: ${errorMessage(error)}\n` +
      'Do not run the wait command again.\n',
  );
  process.exitCode = 1;
});
