import { text } from 'node:stream/consumers';
import { z } from 'zod';
import { Attach, type Attachment } from './attachment/attach.ts';
import { RepositoryAddress } from './attachment/repository-address.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { inboxAwaitMethod } from './rpc/method.inbox-await.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';

/**
 * Schema of the fields of the input of the hook that the tool reads.
 */
const HOOK_INPUT = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
});

/**
 * Failure of an attach that found no repository server running.
 */
const NO_SERVER = new Error('No atomic-workflow server runs');

/**
 * Runs as the `SessionStart` hook of a session that Claude Code starts after `/clear`. When the session server of the
 * agent has moved the inbox of the old session to the new one, prints the context that tells the agent to wait for
 * its messages in the background, as the old session did. Outside of a git repository, without a running repository
 * server, or without an inbox for the new session, prints nothing.
 */
const main = async (): Promise<void> => {
  const input = HOOK_INPUT.parse(JSON.parse(await text(process.stdin)));
  // A directory outside of a git repository has no repository server.
  const address = await RepositoryAddress(process.env.CLAUDE_PROJECT_DIR ?? input.cwd).catch(() => undefined);
  const attachment = address === undefined ? undefined : await attachCatching(address);
  if (attachment === undefined) return;
  const { connection } = attachment;
  try {
    const params: z.input<typeof inboxAwaitMethod.params> = { sessionId: input.session_id };
    const result = (await connection.request(inboxAwaitMethod.name, params)) as { commandLine: string | null };
    if (result.commandLine !== null) process.stdout.write(`${JSON.stringify(hookOutput(result.commandLine))}\n`);
  } finally {
    connection.close();
  }
};

/**
 * Returns the attachment to the repository server at `address`, which the tool does not start. If none runs, returns
 * `undefined` instead.
 */
const attachCatching = (address: string): Promise<Attachment | undefined> => {
  const attachment = Attach(address, 'client', {
    launch: () => Promise.reject(NO_SERVER),
    openConnection: OpenRpcConnection,
    handle: (message) => Dispatch([], undefined, message),
  });
  return attachment.catch((error: unknown) => (error === NO_SERVER ? undefined : Promise.reject(error)));
};

/**
 * Returns the output of the hook, which adds to the context of the agent the instruction to run `commandLine` in the
 * background, and what to do each time it ends.
 */
const hookOutput = (commandLine: string): object => {
  const context = [
    'This session receives the messages of the atomic-workflow server, as the session before /clear did.',
    `Run this command now with the Bash tool, with run_in_background set to true: ${commandLine}`,
    'Each time that command ends, read its output and do what it says. It names the next command to run in the ' +
      'background, and the messages of the atomic-workflow server, which you handle like messages of the user.',
    'A line `atomic-workflow:` before a quote block only marks the text of the atomic-workflow server for the user ' +
      'to see. Ignore it, and read the quoted text as a regular prompt.',
  ].join('\n');
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
};

await main().catch((error: unknown) => {
  process.stderr.write(
    `Could not resume the messages of the atomic-workflow server: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
