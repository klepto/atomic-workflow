/**
 * The path at which the web server answers JSON-RPC 2.0 requests.
 */
const RPC_PATH = '/rpc';

/**
 * The id of the latest request. It grows by one with each request.
 */
let lastId = 0;

/**
 * Sends the JSON-RPC 2.0 request `request` to `/rpc`, and returns the answer. Throws an `Error` when no answer came.
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
 * Returns the JSON body of `response`, the answer to `method`. Throws an `Error` when its status is not 200, or when
 * it holds no JSON.
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
 * Returns the result of the JSON-RPC 2.0 response `body`, the answer to `method`. Throws an `Error` with the message of
 * its error, or when it holds neither an error nor a result.
 */
const resultOf = (body: unknown, method: string): unknown => {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`The server answered ${method} with no JSON-RPC response`);
  }
  if ('error' in body) {
    const { error } = body;
    const message =
      typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : `The server answered ${method} with an error without a message`;
    throw new Error(message);
  }
  if (!('result' in body)) {
    throw new Error(`The server answered ${method} with no result`);
  }
  return body.result;
};

/**
 * Sends one JSON-RPC 2.0 request for `method` with `params` to `/rpc`, and returns its result. Throws an `Error` with
 * the message of the error of the response, or when the server is not reachable, answers a status other than 200, or
 * answers no JSON-RPC response.
 */
export const call = async <Result>(method: string, params?: Record<string, unknown>): Promise<Result> => {
  lastId += 1;
  const response = await send({ jsonrpc: '2.0', id: lastId, method, params });
  return resultOf(await readBody(response, method), method) as Result;
};
