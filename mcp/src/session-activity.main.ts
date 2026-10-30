import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { socketAttach } from './attachment/attach.socket.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { hookDirectory, parseHookInput } from './client/hook-input.ts';
import { HOOK_ACTIVITY_STATUS, reportActivity } from './client/report-activity.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';

/**
 * Runs as a hook of a Claude Code session, and reports to the repository server that the agent of the session has the
 * status that the argument `--status <status>` names: `idle` once a turn ended, and `waiting` while the agent is
 * blocked on the user, such as by a permission prompt. Outside of a git repository, or without a running repository
 * server, reports nothing. Prints nothing.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { status: { type: 'string' } } });
  const status = HOOK_ACTIVITY_STATUS.parse(values.status);
  const input = parseHookInput(await text(process.stdin));
  await reportActivity(input.session_id, status, hookDirectory(input, process.env), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
  });
};

await main().catch((error: unknown) => {
  process.stderr.write(
    `Could not report the status of the session to the atomic-workflow server: ${errorMessage(error)}\n`,
  );
  process.exitCode = 1;
});
