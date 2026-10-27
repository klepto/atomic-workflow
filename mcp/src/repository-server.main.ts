import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { AwaitCommandLine } from './attachment/await-command-line.ts';
import { CreateInboxes } from './attachment/inboxes.ts';
import { ServeRepository } from './attachment/serve-repository.ts';
import { CreateSessionActivity } from './attachment/session-activity.ts';
import { CreateSessionConnections } from './attachment/session-connections.ts';
import { CreateSubagents } from './attachment/subagents.ts';
import { CreateTicketClaims } from './attachment/ticket-claims.ts';
import { CreateChangeFeed } from './changes/change-feed.ts';
import { PublishChanges } from './changes/publish-changes.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { type MethodContext, Methods } from './rpc/method.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';
import { DatabasePath } from './storage/database-path.ts';
import { OpenStorage, type Storage } from './storage/open-storage.ts';
import { StartWebServer } from './web/start-web-server.ts';
import { CopyIgnored } from './worktree/copy-ignored.ts';
import { MainWorktree } from './worktree/main-worktree.ts';
import { CreateWorktrees } from './worktree/worktrees.ts';

/**
 * Absolute path of the entry point of the command line tool that waits for the messages of a session, which sits
 * beside this entry point and is named like it with `await-command` in place of `repository-server`:
 * `await-command.main.ts` in the sources, and `await-command.mjs` in the bundle.
 */
const AWAIT_COMMAND = join(
  import.meta.dirname,
  basename(import.meta.filename).replace('repository-server', 'await-command'),
);

/**
 * Absolute path of the directory of the built web app, `plugin/dist/web/`, which the web server serves: `web` beside
 * this entry point in the bundle, and `plugin/dist/web` of the root of the repository in the sources.
 */
const WEB_DIRECTORY = import.meta.filename.endsWith('.ts')
  ? join(import.meta.dirname, '..', '..', 'plugin', 'dist', 'web')
  : join(import.meta.dirname, 'web');

/**
 * Serves as the repository server at the address that the argument `--address <address>` names, with a web server on
 * a free port of the local host. Clients call the methods of `Methods` at the address and on the web server alike.
 * The methods keep their data in the storage of the repository that holds the directory that the argument
 * `--directory <directory>` names, and its worktrees below the home of the user. The process ends when the last session server leaves.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { address: { type: 'string' }, directory: { type: 'string' } } });
  if (values.address === undefined) throw new Error('The argument --address <address> is missing');
  if (values.directory === undefined) throw new Error('The argument --directory <directory> is missing');
  const mainWorktree = await MainWorktree(values.directory);
  const storage = await OpenStorage(await DatabasePath(values.directory));
  try {
    await serve(values.address, values.directory, mainWorktree, storage);
  } finally {
    storage.close();
  }
};

/**
 * Serves as the repository server at `address`, for the repository that holds `directory` and has the main worktree
 * `mainWorktree`, with the stores of `storage`, until the last session server leaves. The services that hold the state
 * publish their changes to a change feed, which the web server streams.
 */
const serve = async (address: string, directory: string, mainWorktree: string, storage: Storage): Promise<void> => {
  const changes = CreateChangeFeed();
  const published = PublishChanges(
    {
      messageLog: storage.messageLog,
      tasks: storage.tasks,
      sessions: storage.sessions,
      sessionConnections: CreateSessionConnections(),
      subagents: CreateSubagents(),
      activity: CreateSessionActivity(),
    },
    changes,
  );
  const context: MethodContext = {
    sessions: published.sessions,
    messageLog: published.messageLog,
    tasks: published.tasks,
    sessionConnections: published.sessionConnections,
    subagents: published.subagents,
    activity: published.activity,
    inboxes: CreateInboxes(),
    worktrees: CreateWorktrees({ directory, home: homedir(), copyIgnored: CopyIgnored }),
    ticketClaims: CreateTicketClaims(),
    mainWorktree,
    caller: undefined,
    awaitCommandLine: (sessionId) => AwaitCommandLine(AWAIT_COMMAND, sessionId),
  };
  const webServer = await StartWebServer((message) => Dispatch(Methods, context, message), {
    directory: WEB_DIRECTORY,
    changes,
  });
  try {
    await ServeRepository(address, webServer.url, Methods, context, {
      dispatch: Dispatch,
      openConnection: OpenRpcConnection,
    });
  } finally {
    await webServer.close();
  }
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
