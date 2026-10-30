import type { z } from 'zod';
import { inboxAwaitMethod } from '../rpc/method.inbox-await.ts';
import { type AttachClientDependencies, attachRunningClient } from './attach-client.ts';

/**
 * Output that only the `SessionStart` hook gives.
 */
interface SessionStartSpecificOutput {
  /**
   * Name of the event of the hook.
   */
  readonly hookEventName: 'SessionStart';

  /**
   * Text that Claude Code adds to the context of the agent.
   */
  readonly additionalContext: string;
}

/**
 * Output of the `SessionStart` hook, which Claude Code adds to the context of the agent.
 */
interface SessionStartOutput {
  /**
   * Output that only the `SessionStart` hook gives.
   */
  readonly hookSpecificOutput: SessionStartSpecificOutput;
}

/**
 * Returns the output of the `SessionStart` hook of the new session `sessionId`, which Claude Code started after
 * `/clear`, on the repository server of the repository that holds `directory`, with `dependencies`. When the session
 * server of the agent has moved the inbox of the old session to the new one, the output tells the agent to wait for its
 * messages in the background, as the old session did. Outside of a git repository, without a running repository
 * server, or without an inbox for the new session, returns `undefined` instead.
 * If the attach or the request fails, rejects.
 */
export const resumeMessages = async (
  sessionId: string,
  directory: string,
  dependencies: AttachClientDependencies,
): Promise<SessionStartOutput | undefined> => {
  const attachment = await attachRunningClient(directory, dependencies);
  if (attachment === undefined) return undefined;
  const { connection } = attachment;
  try {
    const params: z.input<typeof inboxAwaitMethod.params> = { sessionId };
    const result = (await connection.request(inboxAwaitMethod.name, params)) as { commandLine: string | null };
    return result.commandLine === null ? undefined : sessionStartOutput(result.commandLine);
  } finally {
    connection.close();
  }
};

/**
 * Returns the output of the hook, which adds to the context of the agent the instruction to run `commandLine` in the
 * background, and what to do each time it ends.
 */
const sessionStartOutput = (commandLine: string): SessionStartOutput => {
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
