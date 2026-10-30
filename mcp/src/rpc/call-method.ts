import type { z } from 'zod';
import type { Method } from './method.ts';
import type { RpcConnection } from './rpc-connection.ts';

/**
 * Sends the request of `method` with the parameters `params` over `connection`, and returns the result of its response
 * as the type of `method` declares it. Rejects as `RpcConnection.request` does.
 */
export const callMethod = async <Params extends z.ZodObject, Result, Context>(
  method: Method<Params, Result, Context>,
  params: z.input<Params>,
  connection: RpcConnection,
): Promise<Result> =>
  // The peer runs `method` itself, so the result has the type of `method`. No schema of the result exists to check it.
  (await connection.request(method.name, params)) as Result;
