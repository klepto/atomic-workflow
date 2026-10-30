import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Attachment } from '../attachment/attach.ts';
import { errorMessage } from '../rpc/error-message.ts';
import { METHODS } from '../rpc/method.ts';
import { SESSION_METHODS } from '../rpc/session-method.ts';
import { followSessions } from './follow-sessions.ts';
import { registerMethodTool } from './register-method-tool.ts';
import type { Session } from './session.ts';
import { failureResult, textResult } from './tool-result.ts';

/**
 * Attaches `session` to the repository server, which starts when none runs, and returns the result of the tool
 * `activate`, which names the command that waits for the messages of the session. A session that is attached already
 * stays attached. If the attach fails, returns a tool result that reports the failure instead, and `session` stays
 * dormant.
 */
export const activate = async (session: Session): Promise<CallToolResult> => {
  const active = session.attachment !== undefined;
  session.attachment ??= attach(session);
  return session.attachment.then(
    (attachment) => {
      const status = active ? 'Atomic-workflow already attached.' : attachedMessage(attachment);
      return textResult(`${status}\nWeb: ${attachment.url}\n\n${waitInstruction(session)}`);
    },
    (error: unknown) => {
      session.attachment = undefined;
      return failureResult(`Could not attach to the atomic-workflow server: ${errorMessage(error)}`);
    },
  );
};

/**
 * Returns the message of a fresh `attachment` to the repository server.
 */
const attachedMessage = (attachment: Attachment): string =>
  attachment.launched ? 'Started the atomic-workflow server.' : 'Attached to the atomic-workflow server.';

/**
 * Returns the instruction to the agent of `session` to wait for the messages of its session in the background. If the
 * session has no known transcript, it is not bound and receives no messages, which the instruction says instead.
 */
const waitInstruction = (session: Session): string => {
  const { transcript } = session;
  if (transcript === undefined) return 'This session cannot receive the messages of the atomic-workflow server.';
  return [
    'Run this command in the background now, with run_in_background set to true, to wait for the messages of the ' +
      'atomic-workflow server:',
    session.dependencies.awaitCommandLine(session.options.awaitCommandEntryPoint, transcript.sessionId),
  ].join('\n');
};

/**
 * Returns the attachment of `session` to the repository server once the session of the agent is bound, and offers one
 * tool per method of `METHODS` that agents can call while it lasts. While it lasts, the session server answers the
 * methods of `SESSION_METHODS`, binds each session of the agent to the connection, and logs its transcript to the
 * repository server. When the connection closes, the tools go away, the log stops and the session becomes dormant
 * again. If no repository server runs, it launches one, and rejects as `AttachFunction` says.
 */
const attach = async (session: Session): Promise<Attachment> => {
  const { repositoryAddress, attach, launch, openConnection, dispatch } = session.dependencies;
  const { directory, nodePath, repositoryServerEntryPoint } = session.options;
  const address = await repositoryAddress(directory);
  const attachment = await attach(address, 'session', {
    launch: () => launch([nodePath, repositoryServerEntryPoint, '--address', address, '--directory', directory]),
    openConnection,
    handle: (message) => dispatch(SESSION_METHODS, session.context, message),
  });
  const tools = METHODS.filter((method) => method.agent).map((method) =>
    registerMethodTool(session.server, attachment.connection, method),
  );
  const logging = new AbortController();
  void attachment.connection.closed.then(() => {
    session.attachment = undefined;
    session.transcript = undefined;
    session.skills = new Map();
    logging.abort();
    for (const tool of tools) tool.remove();
  });
  const bound = Promise.withResolvers<void>();
  void followSessions(session, attachment.connection, logging.signal, bound.resolve);
  await bound.promise;
  return attachment;
};
