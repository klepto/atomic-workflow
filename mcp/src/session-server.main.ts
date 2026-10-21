import { basename, join } from 'node:path';
import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { Attach, type AttachFunction, type Attachment } from './attachment/attach.ts';
import { AwaitCommandLine } from './attachment/await-command-line.ts';
import { BIND_SESSION_METHOD, type BindSessionParams } from './attachment/bind-session.ts';
import { RepositoryAddress, type RepositoryAddressFunction } from './attachment/repository-address.ts';
import { Launch, type LaunchFunction } from './launch/launch.ts';
import { Dispatch, type DispatchFunction } from './rpc/dispatch.ts';
import { subagentEndMethod } from './rpc/method.subagent-end.ts';
import { type Method, Methods } from './rpc/method.ts';
import { OpenRpcConnection, type OpenRpcConnectionFunction, type RpcConnection } from './rpc/rpc-connection.ts';
import { type SessionMethodContext, SessionMethods } from './rpc/session-method.ts';
import {
  FindSubagentTranscript,
  type FindSubagentTranscriptFunction,
  FindTranscript,
  type FindTranscriptFunction,
  type Transcript,
} from './transcript/find-transcript.ts';
import { LogTranscript, type LogTranscriptFunction } from './transcript/log-transcript.ts';
import { TailFile, type TailFileFunction } from './transcript/tail-file.ts';

/**
 * Name of the MCP server, under which a session sees its tools.
 */
const SERVER_NAME = 'atomic-workflow';

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
 * Absolute path of the entry point of the command line tool that waits for the messages of a session, which sits
 * beside this entry point and is named like it with `await-command` in place of `session-server`.
 */
const AWAIT_COMMAND = join(
  import.meta.dirname,
  basename(import.meta.filename).replace('session-server', 'await-command'),
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
   * Function that finds the transcript of a subagent of the session.
   */
  readonly findSubagentTranscript: FindSubagentTranscriptFunction;

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

  /**
   * Transcript of the session that the agent runs now, while it is logged, or `undefined` while none is.
   */
  transcript: Transcript | undefined;
}

/**
 * Serves the MCP server of one Claude Code session over the standard input and output. The server lies dormant until
 * the tool `activate` attaches it to the repository server of the project. While attached, it offers one tool per
 * method of `Methods` that agents can call. The agent receives the messages of the repository server with a command
 * that it runs in the background, which `activate` names. The server ends when the session closes its standard input.
 */
const main = async (): Promise<void> => {
  const server = new McpServer({ name: SERVER_NAME, version: '0.0.0' });
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
      findSubagentTranscript: FindSubagentTranscript,
      logTranscript: LogTranscript,
      tailFile: TailFile,
    },
    server,
    context: {
      followSubagent: (sessionId, parentId) => followSubagent(session, sessionId, parentId),
    },
    attachment: undefined,
    transcript: undefined,
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
 * Attaches `session` to the repository server, which starts when none runs, and returns the result of the tool
 * `activate`, which names the command that waits for the messages of the session. A session that is attached already
 * stays attached.
 */
const activate = (session: Session): Promise<CallToolResult> => {
  const active = session.attachment !== undefined;
  session.attachment ??= attach(session);
  return session.attachment.then(
    (attachment) => {
      const status = active ? 'Atomic-workflow already attached.' : attachedMessage(attachment);
      return text(`${status}\nWeb: ${attachment.url}\n\n${waitInstruction(session.transcript)}`);
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
 * Returns the instruction to the agent to wait for the messages of the session of `transcript` in the background.
 * If the session has no known transcript, it is not bound and receives no messages, which the instruction says
 * instead.
 */
const waitInstruction = (transcript: Transcript | undefined): string => {
  if (transcript === undefined) return 'This session cannot receive the messages of the atomic-workflow server.';
  return [
    'Run this command in the background now, with run_in_background set to true, to wait for the messages of the ' +
      'atomic-workflow server:',
    AwaitCommandLine(AWAIT_COMMAND, transcript.sessionId),
  ].join('\n');
};

/**
 * Returns the attachment of `session` to the repository server once the session of the agent is bound, and offers one
 * tool per method of `Methods` that agents can call while it lasts. While it lasts, the session server answers the
 * methods of `SessionMethods`, binds each session of the agent to the connection, and logs its transcript to the
 * repository server. When the connection closes, the tools go away, the log stops and the session becomes dormant
 * again.
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
    session.transcript = undefined;
    logging.abort();
    for (const tool of tools) tool.remove();
  });
  const bound = Promise.withResolvers<void>();
  void followSessions(session, attachment.connection, logging.signal, bound.resolve);
  await bound.promise;
  return attachment;
};

/**
 * Binds the session of the agent of `session` to `connection`, and logs its transcript over `connection`, until
 * `signal` aborts. When the agent moves on to a new session, such as after `/clear`, the binding and the log move on to
 * the new session. The log costs the session no tokens, since no tool and no result takes part in it, so a failure
 * goes to the standard error, which only the logs of the agent show. A session of an agent without a known transcript
 * is neither bound nor logged. Calls `onBound` once the first session is bound, or once it turns out that none is.
 */
const followSessions = async (
  session: Session,
  connection: RpcConnection,
  signal: AbortSignal,
  onBound: () => void,
): Promise<void> => {
  try {
    while (!signal.aborted && (await followCurrentSession(session, connection, signal, onBound)));
  } catch (error) {
    // A request that the close of the connection cuts short is no failure of the log.
    if (!signal.aborted) process.stderr.write(`Could not follow the session: ${messageOf(error)}\n`);
  } finally {
    onBound();
  }
};

/**
 * Binds the session that the agent of `session` runs now to `connection`, calls `onBound`, and logs its transcript
 * over `connection`, until that session ends or `signal` aborts, and returns `true`. If the agent has no known
 * transcript, returns `false` instead.
 */
const followCurrentSession = async (
  session: Session,
  connection: RpcConnection,
  signal: AbortSignal,
  onBound: () => void,
): Promise<boolean> => {
  const { findTranscript, logTranscript, tailFile } = session.dependencies;
  const transcript = await findTranscript(session.environment, session.parentProcessId);
  if (transcript === undefined) return false;
  session.transcript = transcript;
  const params: BindSessionParams = { sessionId: transcript.sessionId };
  await connection.request(BIND_SESSION_METHOD, params, signal);
  onBound();
  await logTranscript(transcript, session.directory, connection, signal, { tailFile });
  return true;
};

/**
 * Logs the transcript of the subagent `sessionId`, which runs inside the session `parentId` of `session`, in the
 * background, until the subagent is stopped or the connection to the repository server closes. Once the subagent
 * is stopped, the repository server learns that it has ended. A failure of the log goes to the standard error, like a
 * failure of the log of the session.
 * If `session` is not attached, or `parentId` is not the session that the agent runs now, throws.
 */
const followSubagent = (session: Session, sessionId: string, parentId: string): void => {
  const parent = session.transcript;
  if (session.attachment === undefined || parent?.sessionId !== parentId)
    throw new Error(`The session ${parentId} is not the current session`);
  void logSubagent(session, session.attachment, parent, sessionId);
};

/**
 * Finds the transcript of the subagent `sessionId` of the session of the transcript `parent`, and logs it over the
 * connection of `attachment` until the subagent is stopped or the connection closes. Once the subagent is stopped, tells
 * the repository server that it has ended. A failure goes to the standard error.
 */
const logSubagent = async (
  session: Session,
  attachment: Promise<Attachment>,
  parent: Transcript,
  sessionId: string,
): Promise<void> => {
  const { findSubagentTranscript, logTranscript, tailFile } = session.dependencies;
  const logging = new AbortController();
  try {
    const { connection } = await attachment;
    void connection.closed.then(() => logging.abort());
    const transcript = await findSubagentTranscript(parent, sessionId, logging.signal);
    if (transcript === undefined) throw new Error('Found no transcript');
    await logTranscript(transcript, session.directory, connection, logging.signal, { tailFile });
    if (logging.signal.aborted) return;
    const params: z.input<typeof subagentEndMethod.params> = { sessionId };
    await connection.request(subagentEndMethod.name, params, logging.signal);
  } catch (error) {
    // A request that the close of the connection cuts short is no failure of the log.
    if (!logging.signal.aborted) process.stderr.write(`Could not log the subagent ${sessionId}: ${messageOf(error)}\n`);
  }
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
