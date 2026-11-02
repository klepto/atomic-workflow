import { text } from 'node:stream/consumers';
import { socketAttach } from './attachment/attach.socket.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { hookDirectory, parsePermissionRequestInput } from './client/hook-input.ts';
import { permissionDecisionOutput, requestPermission } from './client/request-permission.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { errorMessage } from './rpc/error-message.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';
import { pollTailFile } from './transcript/tail-file.poll.ts';
import { diskTranscriptFiles } from './transcript/transcript-files.disk.ts';

/**
 * Runs as the `PermissionRequest` hook of a Claude Code session: opens the permission prompt on the repository server,
 * so the web app shows it, and prints the answer of the web app as the decision of the hook. Prints nothing once the
 * prompt was answered in the terminal, and on any failure, such as without a running repository server, so the
 * terminal keeps the decision. Always exits with code 0.
 */
const main = async (): Promise<void> => {
  const input = parsePermissionRequestInput(await text(process.stdin));
  const answer = await requestPermission(input, hookDirectory(input, process.env), {
    repositoryAddress: gitRepositoryAddress,
    attach: socketAttach,
    openConnection: ndjsonOpenRpcConnection,
    dispatch: zodDispatch,
    transcriptFiles: diskTranscriptFiles,
    tailFile: pollTailFile,
  });
  if (answer !== undefined) process.stdout.write(`${permissionDecisionOutput(answer)}\n`);
};

await main().catch((error: unknown) => {
  process.stderr.write(`Could not show the permission prompt in the atomic-workflow web app: ${errorMessage(error)}\n`);
});
