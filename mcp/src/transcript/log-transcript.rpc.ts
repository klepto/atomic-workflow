import type { z } from 'zod';
import { messageLogMethod } from '../rpc/method.message-log.ts';
import { sessionActivityReportMethod } from '../rpc/method.session-activity-report.ts';
import { sessionAliasSetMethod } from '../rpc/method.session-alias-set.ts';
import { sessionRegisterMethod } from '../rpc/method.session-register.ts';
import { sessionTaskSetMethod } from '../rpc/method.session-task-set.ts';
import { sessionTicketSetMethod } from '../rpc/method.session-ticket-set.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import type { Transcript, TranscriptActivity } from './find-transcript.ts';
import type { LogTranscriptFunction } from './log-transcript.ts';

/**
 * `LogTranscriptFunction` that calls `sessionRegister` once and then `messageLog` for each message, one after the
 * other, so the log keeps the order of the transcript. For each result of `taskCreate` or `taskGet` in the transcript,
 * it calls `sessionTaskSet` with its task, and after a result of `taskCreate`, `sessionAliasSet` with the plan alias of
 * the task, as `planAlias` builds it. For each result of `worktreeCreate`, it calls `sessionTicketSet` with its
 * ticket. After the messages of each read of the transcript, it calls
 * `sessionActivityReport` once with the last status that the read shows. The end of the session stops the tail of the
 * transcript, which reads the file once more before it resolves.
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
  const since = Date.now();
  const ended = new AbortController();
  const following = AbortSignal.any([signal, ended.signal]);
  const stop = (): void => ended.abort();
  // Requests take `signal`, not `following`, so the last read after the end of the session still logs its messages.
  await Promise.all([
    transcript.waitForEnd(following).finally(stop),
    dependencies
      .tailFile(transcript.path, (lines) => logLines(transcript, connection, lines, since, signal), following)
      .finally(stop),
  ]);
};

/**
 * Logs each message that the lines `lines` of `transcript` hold over `connection`, in order, with the task of each
 * result of a tool that holds one, and then reports the last
 * status of the agent that the lines show from the time `since` on. The lines that the transcript held before the log
 * began show the past, not the status now.
 */
const logLines = async (
  transcript: Transcript,
  connection: RpcConnection,
  lines: readonly string[],
  since: number,
  signal: AbortSignal,
): Promise<void> => {
  for (const line of lines) {
    await reportTask(transcript, connection, line, signal);
    await reportTicket(transcript, connection, line, signal);
    const message = transcript.parse(line);
    if (message === undefined) continue;
    const params: z.input<typeof messageLogMethod.params> = { sessionId: transcript.sessionId, ...message };
    await connection.request(messageLogMethod.name, params, signal);
  }
  const activity = lastActivity(transcript, lines, since);
  if (activity === undefined) return;
  const params: z.input<typeof sessionActivityReportMethod.params> = {
    sessionId: transcript.sessionId,
    status: activity.status,
    at: activity.timestamp,
  };
  await connection.request(sessionActivityReportMethod.name, params, signal);
};

/**
 * Tells the repository server over `connection` the task that the line `line` of `transcript` holds as the result of
 * a tool, if it holds one, as the task that the session of the transcript works on. If the tool created the task, also
 * names the session after it, with the alias that `planAlias` returns.
 */
const reportTask = async (
  transcript: Transcript,
  connection: RpcConnection,
  line: string,
  signal: AbortSignal,
): Promise<void> => {
  const task = transcript.parseTask(line);
  if (task === undefined) return;
  const { sessionId } = transcript;
  const params: z.input<typeof sessionTaskSetMethod.params> = { sessionId, taskId: task.taskId };
  await connection.request(sessionTaskSetMethod.name, params, signal);
  if (!task.created) return;
  const alias: z.input<typeof sessionAliasSetMethod.params> = { sessionId, alias: planAlias(task.slug) };
  await connection.request(sessionAliasSetMethod.name, alias, signal);
};

/**
 * Tells the repository server over `connection` the ticket that the line `line` of `transcript` holds as the result of
 * a tool, if it holds one, as the ticket that the session of the transcript works on.
 */
const reportTicket = async (
  transcript: Transcript,
  connection: RpcConnection,
  line: string,
  signal: AbortSignal,
): Promise<void> => {
  const ticketId = transcript.parseTicket(line);
  if (ticketId === undefined) return;
  const params: z.input<typeof sessionTicketSetMethod.params> = { sessionId: transcript.sessionId, ticketId };
  await connection.request(sessionTicketSetMethod.name, params, signal);
};

/**
 * Returns the alias of a session that created the task with the slug `slug`: `plan-<slug>`, cut to
 * `SESSION_ALIAS_MAX_LENGTH` characters.
 */
const planAlias = (slug: string): string => `plan-${slug}`.slice(0, SESSION_ALIAS_MAX_LENGTH);

/**
 * Returns the status of the agent that the last line of `lines` with a status shows, among the lines of `transcript`
 * from the time `since` on. If no such line shows a status, returns `undefined` instead.
 */
const lastActivity = (
  transcript: Transcript,
  lines: readonly string[],
  since: number,
): TranscriptActivity | undefined =>
  lines
    .map((line) => transcript.parseActivity(line))
    .findLast((activity) => activity !== undefined && activity.timestamp >= since);
