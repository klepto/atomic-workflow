/**
 * Function that sends one JSON-RPC 2.0 request for the method `method` with the parameters `params` to the server, and
 * returns its result. Rejects with an `RpcCallError` with the message and the details of the error of the response,
 * and with an `Error` when the server is not reachable, answers a status other than 200, or answers no JSON-RPC
 * response.
 */
export type CallFunction = <Result>(method: string, params?: Record<string, unknown>) => Promise<Result>;

/**
 * Failure of a call that the server answered with a JSON-RPC 2.0 error: its message, and the details of the error.
 */
export class RpcCallError extends Error {
  /**
   * Details of the error, such as the kind of a refusal of the worktrees, or `undefined` when it has none.
   */
  readonly data: unknown;

  /**
   * Creates the failure with the message `message` and the details `data`.
   */
  constructor(message: string, data: unknown) {
    super(message);
    this.name = 'RpcCallError';
    this.data = data;
  }
}

/**
 * Returns the result of the JSON-RPC 2.0 response `body`, the answer to the method `method`. Throws an `RpcCallError`
 * with the message and the details of its error, or an `Error` when it holds neither an error nor a result.
 */
export const resultOf = (body: unknown, method: string): unknown => {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`The server answered ${method} with no JSON-RPC response`);
  }
  if ('error' in body) {
    const { error } = body;
    const message =
      typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : `The server answered ${method} with an error without a message`;
    const data = typeof error === 'object' && error !== null && 'data' in error ? error.data : undefined;
    throw new RpcCallError(message, data);
  }
  if (!('result' in body)) {
    throw new Error(`The server answered ${method} with no result`);
  }
  return body.result;
};
