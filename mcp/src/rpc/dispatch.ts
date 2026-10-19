import { zodDispatch } from './dispatch.zod.ts';
import type { z } from 'zod';
import type { RpcResponse } from './message.ts';
import type { Method } from './method.ts';

/**
 * Function that runs the JSON-RPC 2.0 request `message` with the method of `methods` that it names and the services
 * of `context`, and returns the response to send back. A notification gets no response, so returns `undefined` for it. A message that is not a
 * valid request, a request of an unknown method, invalid parameters and a failure of the method all resolve to an
 * `RpcFailure`. Never rejects.
 */
export type DispatchFunction = <Context>(
  methods: readonly Method<z.ZodObject, unknown, Context>[],
  context: Context,
  message: unknown,
) => Promise<RpcResponse | undefined>;

/**
 * Default `DispatchFunction`, which checks the request and the parameters with zod.
 */
export const Dispatch: DispatchFunction = zodDispatch;
