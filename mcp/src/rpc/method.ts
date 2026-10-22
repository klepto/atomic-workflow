import type { z } from 'zod';
import type { Inboxes } from '../attachment/inboxes.ts';
import type { SessionConnections } from '../attachment/session-connections.ts';
import type { Subagents } from '../attachment/subagents.ts';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import type { TaskStore } from '../storage/task-store.ts';
import { inboxAwaitCommandMethod } from './method.inbox-await-command.ts';
import { inboxAwaitMethod } from './method.inbox-await.ts';
import { taskCreateMethod } from './method.task-create.ts';
import { goalDeleteMethod } from './method.goal-delete.ts';
import { messageDeliverMethod } from './method.message-deliver.ts';
import { echoMethod } from './method.echo.ts';
import { subagentEndMethod } from './method.subagent-end.ts';
import { taskGetMethod } from './method.task-get.ts';
import { taskListMethod } from './method.task-list.ts';
import { taskDeleteMethod } from './method.task-delete.ts';
import { sessionListMethod } from './method.session-list.ts';
import { messageListMethod } from './method.message-list.ts';
import { messageLogMethod } from './method.message-log.ts';
import { sessionRegisterMethod } from './method.session-register.ts';
import { designSaveMethod } from './method.design-save.ts';
import { goalSaveMethod } from './method.goal-save.ts';
import { ticketsSaveMethod } from './method.tickets-save.ts';
import { taskSetStatusMethod } from './method.task-set-status.ts';
import { subagentStartMethod } from './method.subagent-start.ts';
import { subagentStopMethod } from './method.subagent-stop.ts';

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
   * Inboxes of the bound sessions and of the started subagents.
   */
  readonly inboxes: Inboxes;

  /**
   * Returns the command line that waits for the messages of the session `sessionId`, which an agent runs in the
   * background.
   */
  awaitCommandLine(sessionId: string): string;
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
export const Methods: readonly Method[] = [
  echoMethod,
  sessionRegisterMethod,
  messageLogMethod,
  messageListMethod,
  sessionListMethod,
  messageDeliverMethod,
  subagentStartMethod,
  subagentStopMethod,
  subagentEndMethod,
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
];
