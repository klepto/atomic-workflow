import { text } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Attach, type Attachment } from './attachment/attach.ts';
import { RepositoryAddress } from './attachment/repository-address.ts';
import { Dispatch } from './rpc/dispatch.ts';
import { sessionActivityReportMethod } from './rpc/method.session-activity-report.ts';
import { OpenRpcConnection } from './rpc/rpc-connection.ts';

/**
 * Schema of the fields of the input of the hook that the tool reads.
 */
const HOOK_INPUT = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
});

/**
 * Schema of the status that the argument `--status <status>` names: the statuses that a hook reports, since the
 * transcript of the session shows when the agent works.
 */
const STATUS = z.enum(['idle', 'waiting']);

/**
 * Failure of an attach that found no repository server running.
 */
const NO_SERVER = new Error('No atomic-workflow server runs');

/**
 * Runs as a hook of a Claude Code session, and reports to the repository server that the agent of the session has the
 * status that the argument `--status <status>` names: `idle` once a turn ended, and `waiting` while the agent is
 * blocked on the user, such as by a permission prompt. Outside of a git repository, or without a running repository
 * server, reports nothing. Prints nothing.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { status: { type: 'string' } } });
  const status = STATUS.parse(values.status);
  const input = HOOK_INPUT.parse(JSON.parse(await text(process.stdin)));
  // A directory outside of a git repository has no repository server.
  const address = await RepositoryAddress(process.env.CLAUDE_PROJECT_DIR ?? input.cwd).catch(() => undefined);
  const attachment = address === undefined ? undefined : await attachCatching(address);
  if (attachment === undefined) return;
  const { connection } = attachment;
  try {
    const params: z.input<typeof sessionActivityReportMethod.params> = { sessionId: input.session_id, status };
    await connection.request(sessionActivityReportMethod.name, params);
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

await main().catch((error: unknown) => {
  process.stderr.write(
    `Could not report the status of the session to the atomic-workflow server: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
