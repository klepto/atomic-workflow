import type { z } from 'zod';
import { echoMethod } from './method.echo.ts';

/**
 * Operation of the repository server that a client calls by its name over JSON-RPC 2.0.
 */
export interface Method<Params extends z.ZodObject = z.ZodObject, Result = unknown> {
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
   * Runs the method with the valid parameters `params`, and returns its result, which must be valid JSON. To report a
   * failure with a code, throws an `RpcError`.
   */
  handle(params: z.output<Params>): Promise<Result>;
}

/**
 * Methods that every client of the repository server can call.
 */
export const Methods: readonly Method[] = [echoMethod];
