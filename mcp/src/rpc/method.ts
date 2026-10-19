import type { z } from 'zod';
import type { MessageLogStore } from '../storage/message-log-store.ts';
import type { SessionStore } from '../storage/session-store.ts';
import { echoMethod } from './method.echo.ts';
import { listMessagesMethod } from './method.list-messages.ts';
import { logMessageMethod } from './method.log-message.ts';
import { registerSessionMethod } from './method.register-session.ts';

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
}

/**
 * Operation of the repository server that a client calls by its name over JSON-RPC 2.0.
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
export const Methods: readonly Method[] = [echoMethod, registerSessionMethod, logMessageMethod, listMessagesMethod];
