import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { shellAwaitCommandLine } from './attachment/await-command-line.shell.ts';
import { mapCreateInboxes } from './attachment/inboxes.map.ts';
import { mapCreatePermissionPrompts } from './attachment/permission-prompts.map.ts';
import { socketServeRepository } from './attachment/serve-repository.socket.ts';
import { mapCreateSessionActivity } from './attachment/session-activity.map.ts';
import { mapCreateSessionConnections } from './attachment/session-connections.map.ts';
import { mapCreateSubagents } from './attachment/subagents.map.ts';
import { mapCreateTicketClaims } from './attachment/ticket-claims.map.ts';
import { timerCreateChangeFeed } from './changes/change-feed.timer.ts';
import { feedPublishChanges } from './changes/publish-changes.feed.ts';
import { systemClock } from './clock/clock.system.ts';
import { entryPointPath, webDirectoryPath } from './entry/entry-point.ts';
import { errorDetail } from './entry/error-detail.ts';
import { cryptoCreateSessionId } from './rpc/create-session-id.crypto.ts';
import { zodDispatch } from './rpc/dispatch.zod.ts';
import { METHODS, type MethodContext } from './rpc/method.ts';
import { ndjsonOpenRpcConnection } from './rpc/rpc-connection.ndjson.ts';
import { timersTimeoutSignal } from './rpc/timeout-signal.timers.ts';
import { stderrLog } from './session/log.stderr.ts';
import { databasePath } from './storage/database-path.ts';
import { sqliteOpenStorage } from './storage/open-storage.sqlite.ts';
import type { Storage } from './storage/open-storage.ts';
import { pollStartUsageReader } from './usage/usage-reader.poll.ts';
import { claudeConfigPath } from './usage/usage-reader.ts';
import { claudeRefreshUsage } from './usage/usage-refresh.claude.ts';
import { createUsageRefresher } from './usage/usage-refresher.ts';
import { httpStartWebServer } from './web/start-web-server.http.ts';
import { directoryCreateStaticFiles } from './web/static-files.directory.ts';
import { diskCopyIgnored } from './worktree/copy-ignored.disk.ts';
import { createWorktrees } from './worktree/create-worktrees.ts';
import { diskFileSystem } from './worktree/file-system.disk.ts';
import { processRunGit } from './worktree/run-git.process.ts';
import { systemStopProcesses } from './worktree/stop-processes.system.ts';
import { findMainWorktree } from './worktree/worktree-list.ts';

/**
 * Serves as the repository server at the address that the argument `--address <address>` names, with a web server on
 * a free port of the local host. Clients call the methods of `METHODS` at the address and on the web server alike.
 * The methods keep their data in the storage of the repository that holds the directory that the argument
 * `--directory <directory>` names, and its worktrees below the home of the user. The process works from the main
 * worktree of that repository, whichever of its worktrees the directory is in.
 *
 * The process ends in one of three ways: when the last session server leaves, when no session server attaches in the
 * first 10 seconds, as `socketServeRepository` says, or on a failure, such as another repository server that serves
 * the address already. It ends only once every client connection, such as a running wait, has closed, since the
 * server waits for its connections. A failure once it listens, such as ending the runs that are still active, stops the
 * listening and ends every client connection first, so the next session server launches a fresh repository server. A
 * failure goes to the standard error with its stack, and ends the process with the exit code 1. The detached launch
 * of the session server discards the standard error, so a failure at start shows only as an attach that fails.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { address: { type: 'string' }, directory: { type: 'string' } } });
  if (values.address === undefined) throw new Error('The argument --address <address> is missing');
  if (values.directory === undefined) throw new Error('The argument --directory <directory> is missing');
  const mainWorktree = await findMainWorktree(values.directory, processRunGit);
  // The process inherits the working directory of the session that launched it, which may be a task or ticket
  // worktree. Holding it would make the removal of that worktree fail on Windows.
  process.chdir(mainWorktree);
  const storage = await sqliteOpenStorage(databasePath(mainWorktree));
  try {
    await serve(values.address, mainWorktree, storage);
  } finally {
    storage.close();
  }
};

/**
 * Serves as the repository server at `address`, for the repository that has the main worktree `mainWorktree`, with
 * the stores of `storage`, until the server at `address` stops, as `main` says. The services that hold the state
 * publish their changes to a change feed, which the web server streams. Once it listens on `address`, it ends each run
 * of a task that is still active, since the repository server that recorded it stopped. Rejects as `main` says.
 */
const serve = async (address: string, mainWorktree: string, storage: Storage): Promise<void> => {
  const changes = timerCreateChangeFeed();
  const published = feedPublishChanges(
    {
      messageLog: storage.messageLog,
      tasks: storage.tasks,
      sessions: storage.sessions,
      sessionConnections: mapCreateSessionConnections(),
      subagents: mapCreateSubagents(),
      activity: mapCreateSessionActivity(),
      prompts: mapCreatePermissionPrompts(),
    },
    changes,
  );
  const usage = await pollStartUsageReader(claudeConfigPath(process.env.CLAUDE_CONFIG_DIR, homedir()), changes);
  const usageRefresher = createUsageRefresher({ refresh: claudeRefreshUsage, log: stderrLog });
  // The cache may be hours old when the server starts, so the meter would show no 5-hour window until a turn ends.
  usageRefresher.request();
  const awaitCommand = entryPointPath('await-command');
  const context: MethodContext = {
    sessions: published.sessions,
    messageLog: published.messageLog,
    tasks: published.tasks,
    sessionConnections: published.sessionConnections,
    subagents: published.subagents,
    activity: published.activity,
    inboxes: mapCreateInboxes(),
    worktrees: createWorktrees(
      { checkout: mainWorktree, home: homedir(), platform: process.platform },
      {
        runGit: processRunGit,
        fileSystem: diskFileSystem,
        copyIgnored: diskCopyIgnored,
        stopProcesses: systemStopProcesses,
      },
    ),
    ticketClaims: mapCreateTicketClaims(),
    prompts: published.prompts,
    usage,
    usageRefresher,
    mainWorktree,
    caller: undefined,
    awaitCommandLine: (sessionId) => shellAwaitCommandLine(awaitCommand, sessionId),
    clock: systemClock,
    createSessionId: cryptoCreateSessionId,
    timeoutSignal: timersTimeoutSignal,
  };
  const webServer = await httpStartWebServer({
    handle: (message) => zodDispatch(METHODS, context, message),
    changes,
    staticFiles: directoryCreateStaticFiles({ directory: webDirectoryPath() }),
  });
  try {
    await socketServeRepository(address, webServer.url, METHODS, context, {
      dispatch: zodDispatch,
      openConnection: ndjsonOpenRpcConnection,
      log: stderrLog,
      listening: async () => {
        await context.tasks.endRuns(context.clock.now());
      },
    });
  } finally {
    usage.stop();
    await webServer.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(`${errorDetail(error)}\n`);
  process.exitCode = 1;
});
