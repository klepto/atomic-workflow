/**
 * Identifier of a JSON-RPC 2.0 request, which its response repeats.
 */
export type RpcId = string | number;

/**
 * JSON-RPC 2.0 request. A request without `id` is a notification, which gets no response.
 */
export interface RpcRequest {
  /**
   * Version of JSON-RPC, always `2.0`.
   */
  readonly jsonrpc: '2.0';

  /**
   * Identifier of the request, or `undefined` for a notification.
   */
  readonly id?: RpcId;

  /**
   * Name of the method to call.
   */
  readonly method: string;

  /**
   * Parameters of the method, by name.
   */
  readonly params?: object;
}

/**
 * Error object of a JSON-RPC 2.0 response that reports a failure.
 */
export interface RpcErrorObject {
  /**
   * Code of the failure, one of `RpcErrorCode` or a code of a method.
   */
  readonly code: number;

  /**
   * Description of the failure, in one sentence.
   */
  readonly message: string;

  /**
   * Further details of the failure, if any.
   */
  readonly data?: unknown;
}

/**
 * JSON-RPC 2.0 response that reports the result of a request.
 */
export interface RpcSuccess {
  /**
   * Version of JSON-RPC, always `2.0`.
   */
  readonly jsonrpc: '2.0';

  /**
   * Identifier of the request.
   */
  readonly id: RpcId;

  /**
   * Result of the method.
   */
  readonly result: unknown;
}

/**
 * JSON-RPC 2.0 response that reports a failure of a request.
 */
export interface RpcFailure {
  /**
   * Version of JSON-RPC, always `2.0`.
   */
  readonly jsonrpc: '2.0';

  /**
   * Identifier of the request, or `null` when the request was not valid enough to read it.
   */
  readonly id: RpcId | null;

  /**
   * Failure of the request.
   */
  readonly error: RpcErrorObject;
}

/**
 * JSON-RPC 2.0 response.
 */
export type RpcResponse = RpcSuccess | RpcFailure;

/**
 * Function that answers the received JSON-RPC 2.0 message `message`, and returns the response to send back. A
 * notification gets no response, so returns `undefined` for it. Never rejects: a failure resolves to an `RpcFailure`.
 */
export type RpcHandler = (message: unknown) => Promise<RpcResponse | undefined>;
