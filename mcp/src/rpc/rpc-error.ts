import type { RpcErrorObject, RpcFailure, RpcId } from './message.ts';

/**
 * Error codes that JSON-RPC 2.0 defines.
 */
export const RPC_ERROR_CODES = {
  /**
   * The message is not valid JSON.
   */
  PARSE_ERROR: -32700,

  /**
   * The message is not a valid request.
   */
  INVALID_REQUEST: -32600,

  /**
   * No method has the name of the request.
   */
  METHOD_NOT_FOUND: -32601,

  /**
   * The parameters do not fit the method.
   */
  INVALID_PARAMS: -32602,

  /**
   * The method failed for a reason that it does not report with a code of its own.
   */
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Failure of a JSON-RPC 2.0 request. A method throws it to report a failure with a code, and a client rejects with it
 * when a response reports a failure.
 */
export class RpcError extends Error {
  /**
   * Code of the failure, one of `RPC_ERROR_CODES` or a code of a method.
   */
  readonly code: number;

  /**
   * Further details of the failure, or `undefined` for none.
   */
  readonly data: unknown;

  /**
   * Creates the failure with the code `code`, the description `message` and the details `data`.
   */
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }

  /**
   * Returns the failure that the error object `object` of a response reports.
   */
  static of(object: RpcErrorObject): RpcError {
    return new RpcError(object.code, object.message, object.data);
  }

  /**
   * Returns the response to the request `id` that reports this failure.
   */
  toResponse(id: RpcId | null): RpcFailure {
    // JSON leaves out `data` when it is `undefined`.
    return { jsonrpc: '2.0', id, error: { code: this.code, message: this.message, data: this.data } };
  }
}
