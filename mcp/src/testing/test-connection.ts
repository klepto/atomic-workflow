import type { RpcConnection } from '../rpc/rpc-connection.ts';

/**
 * Request that a `TestConnection` sent.
 */
export interface TestRequest {
  /**
   * Name of the method of the request.
   */
  readonly method: string;

  /**
   * Parameters of the request, or `undefined` for none.
   */
  readonly params: object | undefined;
}

/**
 * `RpcConnection` of a test, which records each request that it sends and answers it with a result that the test sets.
 */
export interface TestConnection extends RpcConnection {
  /**
   * Requests that the connection sent, in the order of sending.
   */
  readonly requests: readonly TestRequest[];

  /**
   * Sets `result` as the result of each later request of the method `method`.
   */
  answer(method: string, result: unknown): void;
}

/**
 * Returns a `TestConnection` that answers each request with the result that the test set for its method, or `null`
 * without one. `closed` resolves once the test or the code calls `close`. A request after the close rejects, and the
 * connection does not record it.
 */
export const testConnection = (): TestConnection => {
  const requests: TestRequest[] = [];
  const answers = new Map<string, unknown>();
  let isClosed = false;
  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<void>();
  return {
    requests,
    answer: (method, result) => {
      answers.set(method, result);
    },
    request: async (method, params) => {
      if (isClosed) throw new Error(`The connection is closed, so the request of ${method} was not sent`);
      requests.push({ method, params });
      return answers.has(method) ? answers.get(method) : null;
    },
    closed,
    close: () => {
      isClosed = true;
      resolveClosed();
    },
  };
};
