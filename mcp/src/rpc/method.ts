import type { z } from 'zod';
import type { Inboxes } from '../attachment/inboxes.ts';
import type { PermissionPrompts } from '../attachment/permission-prompts.ts';
import type { SessionActivity } from '../attachment/session-activity.ts';
import type { SessionConnections } from '../attachment/session-connections.ts';
import type { Subagents } from '../attachment/subagents.ts';
import type { TicketClaims } from '../attachment/ticket-claims.ts';
import type { Clock } from '../clock/clock.ts';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import type { TaskStore } from '../storage/task-store.ts';
import type { UsageReader } from '../usage/usage-reader.ts';
import type { UsageRefresher } from '../usage/usage-refresher.ts';
import type { Worktrees } from '../worktree/worktrees.ts';
import type { CreateSessionIdFunction } from './create-session-id.ts';
import { designSaveMethod } from './method.design-save.ts';
import { echoMethod } from './method.echo.ts';
import { goalDeleteMethod } from './method.goal-delete.ts';
import { goalSaveMethod } from './method.goal-save.ts';
import { inboxAwaitMethod } from './method.inbox-await.ts';
import { inboxAwaitCommandMethod } from './method.inbox-await-command.ts';
import { messageDeliverMethod } from './method.message-deliver.ts';
import { messageListMethod } from './method.message-list.ts';
import { messageLogMethod } from './method.message-log.ts';
import { messageLogDeleteMethod } from './method.message-log-delete.ts';
import { permissionPromptAnswerMethod } from './method.permission-prompt-answer.ts';
import { permissionPromptListMethod } from './method.permission-prompt-list.ts';
import { permissionPromptOpenMethod } from './method.permission-prompt-open.ts';
import { repositoryGetMethod } from './method.repository-get.ts';
import { sessionActionReportMethod } from './method.session-action-report.ts';
import { sessionActivityReportMethod } from './method.session-activity-report.ts';
import { sessionAliasSetMethod } from './method.session-alias-set.ts';
import { sessionDeleteMethod } from './method.session-delete.ts';
import { sessionListMethod } from './method.session-list.ts';
import { sessionRegisterMethod } from './method.session-register.ts';
import { sessionTaskSetMethod } from './method.session-task-set.ts';
import { sessionTicketSetMethod } from './method.session-ticket-set.ts';
import { sessionUsageSetMethod } from './method.session-usage-set.ts';
import { skillListMethod } from './method.skill-list.ts';
import { subagentCreateMethod } from './method.subagent-create.ts';
import { subagentEndMethod } from './method.subagent-end.ts';
import { subagentFinishMethod } from './method.subagent-finish.ts';
import { subagentStartMethod } from './method.subagent-start.ts';
import { subagentStopMethod } from './method.subagent-stop.ts';
import { taskCreateMethod } from './method.task-create.ts';
import { taskDeleteMethod } from './method.task-delete.ts';
import { taskGetMethod } from './method.task-get.ts';
import { taskListMethod } from './method.task-list.ts';
import { taskOrchestratorDeliverMethod } from './method.task-orchestrator-deliver.ts';
import { taskRunEndMethod } from './method.task-run-end.ts';
import { taskRunStartMethod } from './method.task-run-start.ts';
import { taskSetStatusMethod } from './method.task-set-status.ts';
import { taskStopMethod } from './method.task-stop.ts';
import { ticketDiffMethod } from './method.ticket-diff.ts';
import { ticketFileDiffMethod } from './method.ticket-file-diff.ts';
import { ticketNextMethod } from './method.ticket-next.ts';
import { ticketRequestChangesMethod } from './method.ticket-request-changes.ts';
import { ticketSetStatusMethod } from './method.ticket-set-status.ts';
import { ticketsSaveMethod } from './method.tickets-save.ts';
import { usageGetMethod } from './method.usage-get.ts';
import { worktreeCreateMethod } from './method.worktree-create.ts';
import { worktreeDeleteMethod } from './method.worktree-delete.ts';
import { worktreeMergeMethod } from './method.worktree-merge.ts';
import type { RpcConnection } from './rpc-connection.ts';
import type { TimeoutSignalFunction } from './timeout-signal.ts';

/**
 * Services of the repository server that a method uses to do its work.
 */
export interface MethodContext {
  /**
   * Store of the sessions.
   */
  readonly sessions: SessionStore;

  /**
   * Store of the message log.
   */
  readonly messageLog: MessageLogStore;

  /**
   * Store of the tasks.
   */
  readonly tasks: TaskStore;

  /**
   * Connections of the attached session servers, by session.
   */
  readonly sessionConnections: SessionConnections;

  /**
   * Subagents that run inside the attached orchestrator sessions.
   */
  readonly subagents: Subagents;

  /**
   * Status of the agent of each session.
   */
  readonly activity: SessionActivity;

  /**
   * Inboxes of the bound sessions and of the started subagents.
   */
  readonly inboxes: Inboxes;

  /**
   * Branches and worktrees of the tasks of the repository.
   */
  readonly worktrees: Worktrees;

  /**
   * Claims of the tickets in progress, each held by the connection of the client that works on it.
   */
  readonly ticketClaims: TicketClaims;

  /**
   * Open permission prompts of the agents of the repository, each until it is answered or its caller goes away.
   */
  readonly prompts: PermissionPrompts;

  /**
   * Reader of the usage limits of the account, from the cache of Claude Code.
   */
  readonly usage: UsageReader;

  /**
   * Refresher of the usage limits of the account, which makes Claude Code fetch them again into its cache.
   */
  readonly usageRefresher: UsageRefresher;

  /**
   * Absolute path of the main worktree of the repository, the same for every worktree that the repository server
   * starts in.
   */
  readonly mainWorktree: string;

  /**
   * Connection that the request came over, or `undefined` for a request without one, such as a request to the web
   * server.
   */
  readonly caller: RpcConnection | undefined;

  /**
   * Returns the command line that waits for the messages of the session `sessionId`, which an agent runs in the
   * background.
   */
  awaitCommandLine(sessionId: string): string;

  /**
   * Clock that gives the current time, such as the start of a session or of a run.
   */
  readonly clock: Clock;

  /**
   * Function that returns the session id of each subagent that the repository server registers.
   */
  readonly createSessionId: CreateSessionIdFunction;

  /**
   * Function that returns a signal that aborts after a delay, such as the wait for a new subagent to attach.
   */
  readonly timeoutSignal: TimeoutSignalFunction;
}

/**
 * Operation that a client calls by its name over JSON-RPC 2.0, on the repository server by default.
 */
export interface Method<Params extends z.ZodObject = z.ZodObject, Result = unknown, Context = MethodContext> {
  /**
   * Name that a request gives to call the method.
   */
  readonly name: string;

  /**
   * Description of the method, in terms that an agent understands.
   */
  readonly description: string;

  /**
   * Whether agents can call the method as a tool. Every other client can call every method.
   */
  readonly agent: boolean;

  /**
   * Schema of the parameters, by name. A request with parameters that do not fit the schema fails without calling
   * `handle`.
   */
  readonly params: Params;

  /**
   * Runs the method with the valid parameters `params` and the services of `context`, and returns its result, which
   * must be valid JSON. To report a failure with a code, throws an `RpcError`.
   */
  handle(params: z.output<Params>, context: Context): Promise<Result>;
}

/**
 * Methods that every client of the repository server can call.
 */
export const METHODS: readonly Method[] = [
  echoMethod,
  repositoryGetMethod,
  usageGetMethod,
  sessionRegisterMethod,
  sessionTaskSetMethod,
  sessionTicketSetMethod,
  sessionAliasSetMethod,
  sessionDeleteMethod,
  messageLogMethod,
  messageLogDeleteMethod,
  messageListMethod,
  sessionListMethod,
  sessionActivityReportMethod,
  sessionActionReportMethod,
  sessionUsageSetMethod,
  messageDeliverMethod,
  subagentStartMethod,
  subagentCreateMethod,
  subagentStopMethod,
  subagentEndMethod,
  subagentFinishMethod,
  taskOrchestratorDeliverMethod,
  taskStopMethod,
  taskRunStartMethod,
  taskRunEndMethod,
  skillListMethod,
  inboxAwaitCommandMethod,
  inboxAwaitMethod,
  taskGetMethod,
  taskListMethod,
  taskCreateMethod,
  taskDeleteMethod,
  goalSaveMethod,
  goalDeleteMethod,
  designSaveMethod,
  ticketsSaveMethod,
  taskSetStatusMethod,
  ticketNextMethod,
  ticketSetStatusMethod,
  ticketDiffMethod,
  ticketFileDiffMethod,
  ticketRequestChangesMethod,
  worktreeCreateMethod,
  worktreeMergeMethod,
  worktreeDeleteMethod,
  permissionPromptOpenMethod,
  permissionPromptListMethod,
  permissionPromptAnswerMethod,
];
