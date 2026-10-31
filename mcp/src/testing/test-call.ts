import { z } from 'zod';
import type { Method } from '../rpc/method.ts';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';

/**
 * Returns the result of `method` with the parameters `params` and the services of `context`, once `params` passed the
 * schema of `method`, as `zodDispatch` checks them. Missing parameters count as an empty object, as for `zodDispatch`.
 * If `params` do not fit the schema, rejects with an `RpcError` of the code `INVALID_PARAMS`, without a call of
 * `handle`. Otherwise rejects as `handle` does.
 */
export const testCall = async <Params extends z.ZodObject, Result, Context>(
  method: Method<Params, Result, Context>,
  params: unknown,
  context: Context,
): Promise<Result> => {
  const parsed = method.params.safeParse(params ?? {});
  if (!parsed.success) throw new RpcError(RPC_ERROR_CODES.INVALID_PARAMS, z.prettifyError(parsed.error));
  return await method.handle(parsed.data, context);
};
