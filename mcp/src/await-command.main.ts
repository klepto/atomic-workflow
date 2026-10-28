import { parseArgs } from 'node:util';
import type { z } from 'zod';
import { Attach } from './attachment/attach.ts';
import { AwaitCommandLine } from './attachment/await-command-line.ts';
import type { InboxMessage } from './attachment/inboxes.ts';
import { RepositoryAddress } from './attachment/repository-address.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { type AwaitCommandResult, inboxAwaitCommandMethod } from './rpc/method.inbox-await-command.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';

/**
 * Usage of the command line tool.
 */
const USAGE = 'Usage: node await-command.mjs <session id> [--after <number of the last message received>]';

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
 * Waits for the next messages of the session that the first argument names, on the repository server of the
 * repository that holds the working directory, and prints them for the agent of the session, which runs this tool in
 * the background, so that its end wakes the agent. The output tells the agent what to do, and names the command line
 * of the next wait, which acknowledges the printed messages. The repository server must run already, and the wait does
 * not keep it alive.
 */
const main = async (): Promise<void> => {
  const { values, positionals } = parseArgs({ options: { after: { type: 'string' } }, allowPositionals: true });
  const [sessionId] = positionals;
  const after = values.after === undefined ? 0 : Number(values.after);
  if (sessionId === undefined || positionals.length > 1 || !Number.isSafeInteger(after) || after < 0)
    throw new Error(USAGE);
  const address = await RepositoryAddress(process.cwd());
  const { connection } = await Attach(address, 'client', {
    launch: () => Promise.reject(new Error(`No atomic-workflow server runs at ${address}`)),
    openConnection: OpenRpcConnection,
    handle: (message) => Dispatch([], undefined, message),
  });
  try {
    const params: z.input<typeof inboxAwaitCommandMethod.params> = { sessionId, after };
    const result = (await connection.request(inboxAwaitCommandMethod.name, params)) as AwaitCommandResult;
    process.stdout.write(`${report(result)}\n`);
  } finally {
    connection.close();
  }
};

/**
 * Returns the text that tells the agent what to do with the outcome `result` of the wait.
 */
const report = (result: AwaitCommandResult): string => {
  switch (result.status) {
    case 'messages':
      return messagesReport(result.messages, result.sessionId);
    case 'stop':
      return 'The atomic-workflow server has stopped the messages of this session. Do not run the wait command again.';
    case 'replaced':
      return 'A newer wait for the messages of this session has replaced this one. Do nothing about it.';
  }
};

/**
 * Returns the text that hands `messages` to the agent, and names the command line of the next wait for the session
 * `sessionId`, which acknowledges them. The session is the one that the inbox belongs to now, which after `/clear` is
 * not the one of this wait. The agent starts the next wait first, so that a message that comes in while it works
 * wakes it again. The agent then quotes the beginning of each message after `MARK`, so that the user sees in the
 * terminal what came in, and from where, in the chat of a subagent as well. The agent reads the text on each message,
 * so it stays short: the skill and the definition of the agent tell the rest.
 */
const messagesReport = (messages: readonly InboxMessage[], sessionId: string): string => {
  const last = messages.at(-1)?.id;
  const commandLine = AwaitCommandLine(import.meta.filename, sessionId, last);
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

// The agent reads the output of the tool, so a failure goes to the standard output as well.
await main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `The wait for the messages of the atomic-workflow server failed: ${reason}\n` +
      'Do not run the wait command again.\n',
  );
  process.exitCode = 1;
});
