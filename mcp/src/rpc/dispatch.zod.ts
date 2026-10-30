import { z } from 'zod';
import type { DispatchFunction } from './dispatch.ts';
import { errorMessage } from './error-message.ts';
import type { RpcErrorObject, RpcId } from './message.ts';
import type { Method } from './method.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Schema of a JSON-RPC 2.0 request. The parameters are checked later, by the schema of the method.
 */
const REQUEST = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

/**
 * `DispatchFunction` that checks the request and the parameters with zod. Batches are not supported: an array is not
 * a valid request.
 */
export const zodDispatch: DispatchFunction = async (methods, context, message) => {
  const request = REQUEST.safeParse(message);
  if (!request.success)
    return new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, 'Invalid request').toResponse(idOf(message));
  const { id, method, params } = request.data;
  const outcome = await call(methods, context, method, params);
  if (id === undefined) return undefined;
  return 'error' in outcome
    ? { jsonrpc: '2.0', id, error: outcome.error }
    : { jsonrpc: '2.0', id, result: outcome.result };
};

/**
 * Returns the identifier of the invalid request `message`, or `null` when it has none that is valid.
 */
const idOf = (message: unknown): RpcId | null => {
  if (typeof message !== 'object' || message === null || !('id' in message)) return null;
  return typeof message.id === 'string' || typeof message.id === 'number' ? message.id : null;
};

/**
 * Returns the result of the method of `methods` named `name` with the parameters `params` and the services of
 * `context`, or the error object of its failure.
 */
const call = async <Context>(
  methods: readonly Method<z.ZodObject, unknown, Context>[],
  context: Context,
  name: string,
  params: unknown,
): Promise<{ readonly result: unknown } | { readonly error: RpcErrorObject }> => {
  const method = methods.find((candidate) => candidate.name === name);
  if (method === undefined)
    return { error: { code: RPC_ERROR_CODES.METHOD_NOT_FOUND, message: `Unknown method ${name}` } };
  const parsed = method.params.safeParse(params ?? {});
  if (!parsed.success)
    return { error: { code: RPC_ERROR_CODES.INVALID_PARAMS, message: z.prettifyError(parsed.error) } };
  try {
    // JSON leaves out a result that is `undefined`, which a response must have.
    return { result: (await method.handle(parsed.data, context)) ?? null };
  } catch (error) {
    return { error: errorObject(error) };
  }
};

/**
 * Returns the error object that reports the failure `error` of a method.
 */
const errorObject = (error: unknown): RpcErrorObject => {
  if (error instanceof RpcError) return { code: error.code, message: error.message, data: error.data };
  return { code: RPC_ERROR_CODES.INTERNAL_ERROR, message: errorMessage(error) };
};
