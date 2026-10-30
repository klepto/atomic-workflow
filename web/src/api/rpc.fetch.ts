import { type CallFunction, resultOf } from '@/api/rpc.ts';

/**
 * Path at which the web server answers JSON-RPC 2.0 requests.
 */
const RPC_PATH = '/rpc';

/**
 * Identifier of the latest request. It grows by one with each request.
 */
let lastId = 0;

/**
 * Sends the JSON-RPC 2.0 request `request` to `/rpc`, and returns the answer. Rejects with an `Error` when no answer
 * came.
 */
const send = async (request: object): Promise<Response> => {
  try {
    return await fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new Error('The server is not reachable', { cause: error });
  }
};

/**
 * Returns the JSON body of `response`, the answer to the method `method`. Rejects with an `Error` when its status is
 * not 200, or when it holds no JSON.
 */
const readBody = async (response: Response, method: string): Promise<unknown> => {
  if (response.status !== 200) {
    throw new Error(`The server answered ${method} with the status ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`The server answered ${method} with no JSON`, { cause: error });
  }
};

/**
 * `CallFunction` that posts each request to `/rpc` of the web server with `fetch`, with an identifier that grows by one
 * with each request.
 */
export const fetchCall: CallFunction = async <Result>(
  method: string,
  params?: Record<string, unknown>,
): Promise<Result> => {
  lastId += 1;
  const response = await send({ jsonrpc: '2.0', id: lastId, method, params });
  return resultOf(await readBody(response, method), method) as Result;
};
