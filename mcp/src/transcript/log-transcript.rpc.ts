import type { z } from 'zod';
import { messageLogMethod } from '../rpc/method.message-log.ts';
import { sessionActionReportMethod } from '../rpc/method.session-action-report.ts';
import { sessionActivityReportMethod } from '../rpc/method.session-activity-report.ts';
import { sessionAliasSetMethod } from '../rpc/method.session-alias-set.ts';
import { sessionRegisterMethod } from '../rpc/method.session-register.ts';
import { sessionTaskSetMethod } from '../rpc/method.session-task-set.ts';
import { sessionTicketSetMethod } from '../rpc/method.session-ticket-set.ts';
import { sessionUsageSetMethod } from '../rpc/method.session-usage-set.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import type { Transcript, TranscriptEntry, TranscriptMessage, TranscriptTask } from './find-transcript.ts';
import type { LogTranscriptFunction } from './log-transcript.ts';
import { summarizeEntries } from './summarize-entries.ts';

/**
 * Log of one transcript to the repository server.
 */
interface Log {
  /**
   * Transcript that is logged.
   */
  readonly transcript: Transcript;

  /**
   * Connection to the repository server.
   */
  readonly connection: RpcConnection;

  /**
   * Signal that cuts each request short.
   */
  readonly signal: AbortSignal;

  /**
   * Time at which the log started, in ms since the epoch.
   */
  readonly since: number;
}

/**
 * `LogTranscriptFunction` that calls the methods of the repository server one at a time, so the log keeps the order of
 * the transcript: `sessionRegister` once, then for each line `sessionTaskSet` and `sessionAliasSet` with its task,
 * `sessionTicketSet` with its ticket and `messageLog` with its message, and after the lines of each read
 * `sessionActivityReport` for each change of the status, `sessionActionReport` once and `sessionUsageSet` once. The
 * alias is the one that `planAlias` builds. The end of the session stops the tail of the transcript, which reads the
 * file once more before it resolves. Resolves and rejects as `LogTranscriptFunction` says.
 */
export const rpcLogTranscript: LogTranscriptFunction = async (
  transcript,
  directory,
  connection,
  signal,
  dependencies,
) => {
  const session: z.input<typeof sessionRegisterMethod.params> = {
    sessionId: transcript.sessionId,
    agent: transcript.agent,
    directory,
  };
  await connection.request(sessionRegisterMethod.name, session, signal);
  const log: Log = { transcript, connection, signal, since: dependencies.clock.now() };
  const ended = new AbortController();
  const following = AbortSignal.any([signal, ended.signal]);
  const stop = (): void => ended.abort();
  // Requests take `signal`, not `following`, so the last read after the end of the session still logs its messages.
  await Promise.all([
    transcript.waitForEnd(following).finally(stop),
    dependencies.tailFile(transcript.path, (lines) => logLines(lines, log), following).finally(stop),
  ]);
};

/**
 * Reports the lines `lines` of the transcript of `log` to the repository server, as `rpcLogTranscript` says: for each
 * line in order its task, its ticket and its message, then the changes of the status, the newest action and the newest
 * token usage that the lines show.
 */
const logLines = async (lines: readonly string[], log: Log): Promise<void> => {
  const entries: TranscriptEntry[] = [];
  for (const line of lines) {
    const entry = log.transcript.parseLine(line);
    entries.push(entry);
    if (entry.task !== undefined) await reportTask(entry.task, log);
    if (entry.ticketId !== undefined) await reportTicket(entry.ticketId, log);
    if (entry.message !== undefined) await logMessage(entry.message, log);
  }
  const { statusChanges, action, usage } = summarizeEntries(entries, log.since);
  const { transcript, connection, signal } = log;
  const { sessionId } = transcript;
  for (const activity of statusChanges) {
    const params: z.input<typeof sessionActivityReportMethod.params> = {
      sessionId,
      status: activity.status,
      at: activity.timestamp,
    };
    await connection.request(sessionActivityReportMethod.name, params, signal);
  }
  if (action !== undefined) {
    const params: z.input<typeof sessionActionReportMethod.params> = {
      sessionId,
      action: action.action,
      at: action.timestamp,
    };
    await connection.request(sessionActionReportMethod.name, params, signal);
  }
  if (usage === undefined) return;
  const params: z.input<typeof sessionUsageSetMethod.params> = {
    sessionId,
    contextTokens: usage.contextTokens,
    model: usage.model,
    effort: usage.effort,
  };
  await connection.request(sessionUsageSetMethod.name, params, signal);
};

/**
 * Tells the repository server `task` as the task that the session of the transcript of `log` works on. If the tool
 * created the task, also names the session after it, with the alias that `planAlias` returns.
 */
const reportTask = async (task: TranscriptTask, log: Log): Promise<void> => {
  const { transcript, connection, signal } = log;
  const { sessionId } = transcript;
  const params: z.input<typeof sessionTaskSetMethod.params> = { sessionId, taskId: task.taskId, created: task.created };
  await connection.request(sessionTaskSetMethod.name, params, signal);
  if (!task.created) return;
  const alias: z.input<typeof sessionAliasSetMethod.params> = { sessionId, alias: planAlias(task.slug) };
  await connection.request(sessionAliasSetMethod.name, alias, signal);
};

/**
 * Tells the repository server the ticket `ticketId` as the ticket that the session of the transcript of `log` works
 * on.
 */
const reportTicket = async (ticketId: number, log: Log): Promise<void> => {
  const params: z.input<typeof sessionTicketSetMethod.params> = { sessionId: log.transcript.sessionId, ticketId };
  await log.connection.request(sessionTicketSetMethod.name, params, log.signal);
};

/**
 * Logs `message` to the repository server as a message of the session of the transcript of `log`.
 */
const logMessage = async (message: TranscriptMessage, log: Log): Promise<void> => {
  const params: z.input<typeof messageLogMethod.params> = { sessionId: log.transcript.sessionId, ...message };
  await log.connection.request(messageLogMethod.name, params, log.signal);
};

/**
 * Returns the alias of a session that created the task with the slug `slug`: `plan-<slug>`, cut to
 * `SESSION_ALIAS_MAX_LENGTH` characters.
 */
const planAlias = (slug: string): string => `plan-${slug}`.slice(0, SESSION_ALIAS_MAX_LENGTH);
