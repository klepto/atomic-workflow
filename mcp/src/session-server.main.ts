import { homedir } from 'node:os';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { socketAttach } from './attachment/attach.socket.ts';
import { shellAwaitCommandLine } from './attachment/await-command-line.shell.ts';
import { gitRepositoryAddress } from './attachment/repository-address.git.ts';
import { systemClock } from './clock/clock.system.ts';
import { entryPointPath } from './entry/entry-point.ts';
import { errorDetail } from './entry/error-detail.ts';
import { detachedLaunch } from './launch/launch.detached.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';
import { createSessionServer } from './session/create-session-server.ts';
import { stderrLog } from './session/log.stderr.ts';
import { claudeCreateTranscriptFinder } from './transcript/find-transcript.claude.ts';
import { rpcLogTranscript } from './transcript/log-transcript.rpc.ts';
import { timersSleep } from './transcript/sleep.timers.ts';
import { pollTailFile } from './transcript/tail-file.poll.ts';
import { diskTranscriptFiles } from './transcript/transcript-files.disk.ts';

/**
 * Serves the MCP server of one Claude Code session over the standard input and output, as `createSessionServer`
 * says. The server ends when the session closes its standard input.
 */
const main = async (): Promise<void> => {
  const transcriptFinder = claudeCreateTranscriptFinder({
    files: diskTranscriptFiles,
    clock: systemClock,
    sleep: timersSleep,
    homeDirectory: homedir(),
  });
  const server = createSessionServer(
    {
      directory: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
      environment: process.env,
      parentProcessId: process.ppid,
      nodePath: process.execPath,
      repositoryServerEntryPoint: entryPointPath('repository-server'),
      awaitCommandEntryPoint: entryPointPath('await-command'),
    },
    {
      repositoryAddress: gitRepositoryAddress,
      attach: socketAttach,
      launch: detachedLaunch,
      openConnection: ndjsonOpenRpcConnection,
      dispatch: zodDispatch,
      awaitCommandLine: shellAwaitCommandLine,
      findTranscript: transcriptFinder.findTranscript,
      findSubagentTranscript: transcriptFinder.findSubagentTranscript,
      logTranscript: rpcLogTranscript,
      tailFile: pollTailFile,
      clock: systemClock,
      log: stderrLog,
    },
  );
  // The open connection to the repository server would keep the process alive after the session has gone.
  process.stdin.once('close', () => process.exit());
  await server.connect(new StdioServerTransport());
};

await main().catch((error: unknown) => {
  process.stderr.write(`${errorDetail(error)}\n`);
  process.exitCode = 1;
});
