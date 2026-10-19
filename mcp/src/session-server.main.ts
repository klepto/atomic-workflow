import { basename, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Attach, type AttachFunction, type Attachment } from './attach.ts';
import { Launch, type LaunchFunction } from './launch.ts';
import { RepositoryAddress, type RepositoryAddressFunction } from './repository-address.ts';

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
   * Dependencies of the session server.
   */
  readonly dependencies: SessionDependencies;

  /**
   * Attachment to the repository server while the session server is active, or a try to attach that is under way.
   * The session server is dormant while this is `undefined`.
   */
  attachment: Promise<Attachment> | undefined;
}

/**
 * Serves the MCP server of one Claude Code session over the standard input and output. The server lies dormant until
 * the tool `activate` attaches it to the repository server of the project, and ends when the session closes its
 * standard input.
 */
const main = async (): Promise<void> => {
  const session: Session = {
    directory: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    dependencies: { repositoryAddress: RepositoryAddress, attach: Attach, launch: Launch },
    attachment: undefined,
  };
  const server = new McpServer({ name: SERVER_NAME, version: '0.0.0' });
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
 * `activate`. A session that is attached already stays attached.
 */
const activate = (session: Session): Promise<CallToolResult> => {
  const active = session.attachment !== undefined;
  session.attachment ??= attach(session);
  return session.attachment.then(
    (attachment) => text(active ? 'Already attached to the repository server.' : attachedMessage(attachment)),
    (error: unknown) => {
      session.attachment = undefined;
      const message = error instanceof Error ? error.message : String(error);
      return { ...text(`Could not attach to the repository server: ${message}`), isError: true };
    },
  );
};

/**
 * Returns the message of a fresh `attachment` to the repository server.
 */
const attachedMessage = (attachment: Attachment): string => {
  return attachment.launched
    ? 'Started the repository server and attached to it.'
    : 'Attached to the running repository server.';
};

/**
 * Returns the attachment of `session` to the repository server. When the connection closes, the session becomes
 * dormant again.
 */
const attach = async (session: Session): Promise<Attachment> => {
  const { repositoryAddress, attach, launch } = session.dependencies;
  const address = await repositoryAddress(session.directory);
  const attachment = await attach(address, () => launch([process.execPath, REPOSITORY_SERVER, '--address', address]));
  void attachment.closed.then(() => {
    session.attachment = undefined;
  });
  return attachment;
};

/**
 * Returns a tool result that holds the text `message`.
 */
const text = (message: string): CallToolResult => {
  return { content: [{ type: 'text', text: message }] };
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
