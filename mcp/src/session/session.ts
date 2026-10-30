import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AttachFunction, Attachment } from '../attachment/attach.ts';
import type { AwaitCommandLineFunction } from '../attachment/await-command-line.ts';
import type { RepositoryAddressFunction } from '../attachment/repository-address.ts';
import type { Clock } from '../clock/clock.ts';
import type { LaunchFunction } from '../launch/launch.ts';
import type { DispatchFunction } from '../rpc/dispatch.ts';
import type { OpenRpcConnectionFunction } from '../rpc/rpc-connection.ts';
import type { SessionMethodContext } from '../rpc/session-method.ts';
import type {
  FindSubagentTranscriptFunction,
  FindTranscriptFunction,
  Transcript,
  TranscriptSkill,
} from '../transcript/find-transcript.ts';
import type { LogTranscriptFunction } from '../transcript/log-transcript.ts';
import type { TailFileFunction } from '../transcript/tail-file.ts';
import type { LogFunction } from './log.ts';

/**
 * Options of a session server.
 */
export interface SessionOptions {
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
   * Absolute path of the Node.js program that runs the repository server.
   */
  readonly nodePath: string;

  /**
   * Absolute path of the entry point of the repository server.
   */
  readonly repositoryServerEntryPoint: string;

  /**
   * Absolute path of the entry point of the command line tool that waits for the messages of a session.
   */
  readonly awaitCommandEntryPoint: string;
}

/**
 * Dependencies of a session server.
 */
export interface SessionDependencies {
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
   * Function that returns the command line that waits for the messages of a session.
   */
  readonly awaitCommandLine: AwaitCommandLineFunction;

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

  /**
   * Source of the time of the log of a transcript.
   */
  readonly clock: Clock;

  /**
   * Function that writes a failure of a log, which costs the session no tokens, since no tool result shows it.
   */
  readonly log: LogFunction;
}

/**
 * State of a session server.
 */
export interface Session {
  /**
   * Options of the session server.
   */
  readonly options: SessionOptions;

  /**
   * Dependencies of the session server.
   */
  readonly dependencies: SessionDependencies;

  /**
   * MCP server of the session.
   */
  readonly server: McpServer;

  /**
   * Services that the methods of `SESSION_METHODS` run with.
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

  /**
   * Skills that the agent of the session of `transcript` can run, as the transcript lists them so far, by name in the
   * order of the list. Empty while no transcript is logged.
   */
  skills: Map<string, TranscriptSkill>;

  /**
   * Identifiers of the background tasks that run the subagents of the session whose transcripts are logged, by the
   * session id of the subagent.
   */
  readonly subagentTasks: Map<string, string>;
}
