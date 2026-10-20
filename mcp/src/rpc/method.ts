import type { z } from 'zod';
import type { SessionConnections } from '../attachment/session-connections.ts';
import type { Subagents } from '../attachment/subagents.ts';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import { awaitCommandMethod } from './method.await-command.ts';
import { deliverMessageMethod } from './method.deliver-message.ts';
import { echoMethod } from './method.echo.ts';
import { endSubagentMethod } from './method.end-subagent.ts';
import { listAttachedSessionsMethod } from './method.list-attached-sessions.ts';
import { listMessagesMethod } from './method.list-messages.ts';
import { logMessageMethod } from './method.log-message.ts';
import { registerSessionMethod } from './method.register-session.ts';
import { startSubagentMethod } from './method.start-subagent.ts';
import { stopSubagentMethod } from './method.stop-subagent.ts';

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
   * Connections of the attached session servers, by session.
   */
  readonly sessionConnections: SessionConnections;

  /**
   * Subagents that run inside the attached orchestrator sessions.
   */
  readonly subagents: Subagents;
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
  registerSessionMethod,
  logMessageMethod,
  listMessagesMethod,
  listAttachedSessionsMethod,
  deliverMessageMethod,
  startSubagentMethod,
  stopSubagentMethod,
  endSubagentMethod,
  awaitCommandMethod,
];
