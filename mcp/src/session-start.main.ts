import { text } from 'node:stream/consumers';
import { socketAttach } from './attachment/attach.socket.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { hookDirectory, parseHookInput } from './client/hook-input.ts';
import { resumeMessages } from './client/resume-messages.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';

/**
 * Runs as the `SessionStart` hook of a session that Claude Code starts after `/clear`. When the session server of the
 * agent has moved the inbox of the old session to the new one, prints the context that tells the agent to wait for
 * its messages in the background, as the old session did. Outside of a git repository, without a running repository
 * server, or without an inbox for the new session, prints nothing.
 */
const main = async (): Promise<void> => {
  const input = parseHookInput(await text(process.stdin));
  const output = await resumeMessages(input.session_id, hookDirectory(input, process.env), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
  });
  if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
};

await main().catch((error: unknown) => {
  process.stderr.write(`Could not resume the messages of the atomic-workflow server: ${errorMessage(error)}\n`);
  process.exitCode = 1;
});
