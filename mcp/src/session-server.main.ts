import { basename, join } from 'node:path';
import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Attach, type AttachFunction, type Attachment } from './attachment/attach.ts';
import { BIND_SESSION_METHOD, type BindSessionParams } from './attachment/bind-session.ts';
import { RepositoryAddress, type RepositoryAddressFunction } from './attachment/repository-address.ts';
import { Launch, type LaunchFunction } from './launch/launch.ts';
import { Dispatch, type DispatchFunction } from './rpc/dispatch.ts';
import { type Method, Methods } from './rpc/method.ts';
import { OpenRpcConnection, type OpenRpcConnectionFunction, type RpcConnection } from './rpc/rpc-connection.ts';
import { type SessionMethodContext, SessionMethods } from './rpc/session-method.ts';
import { FindTranscript, type FindTranscriptFunction } from './transcript/find-transcript.ts';
import { LogTranscript, type LogTranscriptFunction } from './transcript/log-transcript.ts';
import { TailFile, type TailFileFunction } from './transcript/tail-file.ts';

/**
 * Name of the MCP server, under which a session sees its tools.
 */
const SERVER_NAME = 'atomic-workflow';

/**
 * Instructions that the agent receives when the MCP server connects. The agent sees a message that the server pushes
 * into the chat as a `<channel>` event.
 */
const INSTRUCTIONS =
  'Messages from the atomic-workflow server arrive as <channel source="...atomic-workflow"> events. ' +
  'Handle each one like a message of the user.';

/**
 * Absolute path of the repository server entry point, which sits beside this entry point and is named like it with
 * `repository-server` in place of `session-server`: `repository-server.main.ts` in the sources, and
 * `repository-server.mjs` in the bundle.
 */
const REPOSITORY_SERVER = join(
  import.meta.dirname,
  basename(import.meta.filename).replace('session-server', 'repository-server'),
);

/**
 * Dependencies of a session server.
 */
interface SessionDependencies {
  /**
   * Function that returns the address of the repository server.
   */
  readonly repositoryAddress: RepositoryAddressFunction;

  /**
   * Function that connects to the repository server.
   */
  readonly attach: AttachFunction;

  /**
   * Function that starts the repository server.
   */
  readonly launch: LaunchFunction;

  /**
   * Function that opens the JSON-RPC 2.0 connection to the repository server.
   */
  readonly openConnection: OpenRpcConnectionFunction;

  /**
   * Function that runs each request of the repository server with its method.
   */
  readonly dispatch: DispatchFunction;

  /**
   * Function that finds the transcript of the session.
   */
  readonly findTranscript: FindTranscriptFunction;

  /**
   * Function that logs the transcript of the session to the repository server.
   */
  readonly logTranscript: LogTranscriptFunction;

  /**
   * Function that follows the file of the transcript.
   */
  readonly tailFile: TailFileFunction;
}

/**
 * State of a session server.
 */
interface Session {
  /**
   * Directory of the project of the session.
   */
  readonly directory: string;

  /**
   * Environment variables of the session server, which tell the agent of the session and the session.
   */
  readonly environment: NodeJS.ProcessEnv;

  /**
   * Process id of the parent of the session server, which is the agent of the session.
   */
  readonly parentProcessId: number;

  /**
   * Dependencies of the session server.
   */
  readonly dependencies: SessionDependencies;

  /**
   * MCP server of the session.
   */
  readonly server: McpServer;

  /**
   * Services that the methods of `SessionMethods` run with.
   */
  readonly context: SessionMethodContext;

  /**
   * Attachment to the repository server while the session server is active, or a try to attach that is under way.
   * The session server is dormant while this is `undefined`.
   */
  attachment: Promise<Attachment> | undefined;
}

/**
 * Serves the MCP server of one Claude Code session over the standard input and output. The server lies dormant until
 * the tool `activate` attaches it to the repository server of the project. While attached, it offers one tool per
 * method of `Methods` that agents can call, and puts the messages that the repository server delivers into the chat
 * as channel events. It ends when the session closes its standard input.
 */
const main = async (): Promise<void> => {
  const server = new McpServer(
    { name: SERVER_NAME, version: '0.0.0' },
    { capabilities: { experimental: { 'claude/channel': {} } }, instructions: INSTRUCTIONS },
  );
  const session: Session = {
    directory: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    environment: process.env,
    parentProcessId: process.ppid,
    dependencies: {
      repositoryAddress: RepositoryAddress,
      attach: Attach,
      launch: Launch,
      openConnection: OpenRpcConnection,
      dispatch: Dispatch,
      findTranscript: FindTranscript,
      logTranscript: LogTranscript,
      tailFile: TailFile,
    },
    server,
    context: { pushMessage: (content) => pushMessage(server, content) },
    attachment: undefined,
  };
  server.registerTool(
    'activate',
    { description: 'Activates the atomic workflow of this repository. Call it only when a skill tells you to.' },
    () => activate(session),
  );
  // The open connection to the repository server would keep the process alive after the session has gone.
  process.stdin.once('close', () => process.exit());
  await server.connect(new StdioServerTransport());
};

/**
 * Pushes the message `content` into the chat of the session of `server` as a channel event. The agent drops the event
 * without a word when it has not loaded the server as a channel.
 */
const pushMessage = (server: McpServer, content: string): Promise<void> => {
  return server.server.notification({ method: 'notifications/claude/channel', params: { content } });
};

/**
 * Attaches `session` to the repository server, which starts when none runs, and returns the result of the tool
 * `activate`. A session that is attached already stays attached.
 */
const activate = (session: Session): Promise<CallToolResult> => {
  const active = session.attachment !== undefined;
  session.attachment ??= attach(session);
  return session.attachment.then(
    (attachment) => {
      const status = active ? 'Atomic-workflow already attached.' : attachedMessage(attachment);
      return text(`${status}\nWeb: ${attachment.url}`);
    },
    (error: unknown) => {
      session.attachment = undefined;
      return failure(`Could not attach to the atomic-workflow server: ${messageOf(error)}`);
    },
  );
};

/**
 * Returns the message of a fresh `attachment` to the repository server.
 */
const attachedMessage = (attachment: Attachment): string => {
  return attachment.launched ? 'Started the atomic-workflow server.' : 'Attached to the atomic-workflow server.';
};

/**
 * Returns the attachment of `session` to the repository server, and offers one tool per method of `Methods` that
 * agents can call while it lasts. While it lasts, the session server answers the methods of `SessionMethods`, binds
 * each session of the agent to the connection, and logs its transcript to the repository server. When the connection
 * closes, the tools go away, the log stops and the session becomes dormant again.
 */
const attach = async (session: Session): Promise<Attachment> => {
  const { repositoryAddress, attach, launch, openConnection, dispatch } = session.dependencies;
  const address = await repositoryAddress(session.directory);
  const attachment = await attach(address, 'session', {
    launch: () => launch([process.execPath, REPOSITORY_SERVER, '--address', address, '--directory', session.directory]),
    openConnection,
    handle: (message) => dispatch(SessionMethods, session.context, message),
  });
  const tools = Methods.filter((method) => method.agent).map((method) =>
    registerTool(session.server, attachment.connection, method),
  );
  const logging = new AbortController();
  void attachment.connection.closed.then(() => {
    session.attachment = undefined;
    logging.abort();
    for (const tool of tools) tool.remove();
  });
  void followSessions(session, attachment.connection, logging.signal);
  return attachment;
};

/**
 * Binds the session of the agent of `session` to `connection`, and logs its transcript over `connection`, until
 * `signal` aborts. When the agent moves on to a new session, such as after `/clear`, the binding and the log move on to
 * the new session. The log costs the session no tokens, since no tool and no result takes part in it, so a failure
 * goes to the standard error, which only the logs of the agent show. A session of an agent without a known transcript
 * is neither bound nor logged.
 */
const followSessions = async (session: Session, connection: RpcConnection, signal: AbortSignal): Promise<void> => {
  try {
    while (!signal.aborted && (await followCurrentSession(session, connection, signal)));
  } catch (error) {
    // A request that the close of the connection cuts short is no failure of the log.
    if (!signal.aborted)
      process.stderr.write(`Could not follow the session: ${messageOf(error)}
`);
  }
};

/**
 * Binds the session that the agent of `session` runs now to `connection`, and logs its transcript over `connection`,
 * until that session ends or `signal` aborts, and returns `true`. If the agent has no known transcript, returns `false`
 * instead.
 */
const followCurrentSession = async (
  session: Session,
  connection: RpcConnection,
  signal: AbortSignal,
): Promise<boolean> => {
  const { findTranscript, logTranscript, tailFile } = session.dependencies;
  const transcript = await findTranscript(session.environment, session.parentProcessId);
  if (transcript === undefined) return false;
  const params: BindSessionParams = { sessionId: transcript.sessionId };
  await connection.request(BIND_SESSION_METHOD, params, signal);
  await logTranscript(transcript, session.directory, connection, signal, { tailFile });
  return true;
};

/**
 * Offers `method` as a tool of `server` that calls it over `connection`, and returns the tool.
 */
const registerTool = (server: McpServer, connection: RpcConnection, method: Method): RegisteredTool => {
  return server.registerTool(method.name, { description: method.description, inputSchema: method.params }, (params) =>
    callTool(connection, method.name, params),
  );
};

/**
 * Calls the method `name` with the parameters `params` over `connection`, and returns its result as a tool result
 * that holds the result as JSON.
 */
const callTool = (connection: RpcConnection, name: string, params: object): Promise<CallToolResult> => {
  return connection.request(name, params).then(
    (result) => text(JSON.stringify(result)),
    (error: unknown) => failure(messageOf(error)),
  );
};

/**
 * Returns a tool result that holds the text `message`.
 */
const text = (message: string): CallToolResult => {
  return { content: [{ type: 'text', text: message }] };
};

/**
 * Returns a tool result that reports a failure with the text `message`.
 */
const failure = (message: string): CallToolResult => {
  return { ...text(message), isError: true };
};

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
