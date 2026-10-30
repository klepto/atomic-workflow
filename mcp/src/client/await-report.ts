import type { AwaitCommandLineFunction } from '../attachment/await-command-line.ts';
import type { InboxMessage } from '../attachment/inboxes.ts';
import type { AwaitCommandResult } from '../rpc/method.inbox-await-command.ts';

/**
 * Number of characters of a message at most that the agent quotes in its reply.
 */
const QUOTE_LENGTH = 200;

/**
 * Line that marks the quote after it as text of the atomic-workflow server, so that the user tells it apart from the
 * turns of the agent, and the web app can hide it.
 */
const MARK = 'atomic-workflow:';

/**
 * Options of the report of a wait.
 */
interface AwaitReportOptions {
  /**
   * Absolute path of the entry point of the command line tool that waits, which the command line of the next wait
   * runs.
   */
  readonly entryPoint: string;
}

/**
 * Dependencies of the report of a wait.
 */
interface AwaitReportDependencies {
  /**
   * Function that returns the command line of the next wait.
   */
  readonly awaitCommandLine: AwaitCommandLineFunction;
}

/**
 * Returns the text that tells the agent what to do with the outcome `result` of the wait, whose next wait runs the
 * entry point of `options`, with the command line of `dependencies`.
 */
export const awaitReport = (
  result: AwaitCommandResult,
  options: AwaitReportOptions,
  dependencies: AwaitReportDependencies,
): string => {
  switch (result.status) {
    case 'messages':
      return messagesReport(
        result.messages,
        dependencies.awaitCommandLine(options.entryPoint, result.sessionId, lastId(result.messages)),
      );
    case 'stop':
      return 'The atomic-workflow server has stopped the messages of this session. Do not run the wait command again.';
    case 'replaced':
      return 'A newer wait for the messages of this session has replaced this one. Do nothing about it.';
  }
};

/**
 * Returns the number of the last message of `messages`, or `undefined` when there is none.
 */
const lastId = (messages: readonly InboxMessage[]): number | undefined => messages.at(-1)?.id;

/**
 * Returns the text that hands `messages` to the agent, and names `commandLine`, the command line of the next wait,
 * which acknowledges them. The session of the next wait is the one that the inbox belongs to now, which after `/clear`
 * is not the one of this wait. The agent starts the next wait first, so that a message that comes in while it works
 * wakes it again. The agent then quotes the beginning of each message after `MARK`, so that the user sees in the
 * terminal what came in, and from where, in the chat of a subagent as well. The agent reads the text on each message,
 * so it stays short: the skill and the definition of the agent tell the rest.
 */
const messagesReport = (messages: readonly InboxMessage[], commandLine: string): string => {
  const header =
    messages.length === 1 ? 'Handle like a message of the user:' : 'Handle like messages of the user, oldest first:';
  return [
    `Run in the background first: ${commandLine}`,
    'Start your reply with these lines as they are:',
    MARK,
    ...messages.map((message) => quote(message.content)),
    header,
    messages.map((message) => message.content).join('\n\n---\n\n'),
  ].join('\n');
};

/**
 * Returns the quote of the message `content`: its first line that is not blank, cut to `QUOTE_LENGTH` characters,
 * after `> `. If the quote leaves out part of the message, it ends with `…`.
 */
const quote = (content: string): string => {
  const lines = content.trim().split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  const cut = first.length > QUOTE_LENGTH || lines.length > 1;
  return `> ${first.slice(0, QUOTE_LENGTH)}${cut ? ' …' : ''}`;
};
