import type { Duplex } from 'node:stream';
import type { RpcHandler } from './message.ts';

/**
 * JSON-RPC 2.0 connection over a byte stream. Both ends of the stream can send requests, and each end answers the
 * requests that it receives.
 */
export interface RpcConnection {
  /**
   * Sends the request of the method `method` with the parameters `params`, and returns the result of its response.
   * If the response reports a failure, rejects with an `RpcError`. If the connection is closed, closes before the
   * response, or `signal` aborts before the response, rejects as well.
   */
  request(method: string, params?: object, signal?: AbortSignal): Promise<unknown>;

  /**
   * Promise that resolves when the connection closes, from either end.
   */
  readonly closed: Promise<void>;

  /**
   * Closes the connection once the messages that it sent are out.
   */
  close(): void;
}

/**
 * Function that opens a JSON-RPC 2.0 connection over `stream`, answers each request that it receives with `handle`,
 * and returns the connection. A message that is not valid JSON gets a response that reports a parse error. A response
 * settles the request of this end that it answers, and a response to no waiting request is dropped. Once the stream
 * closes, every request that waits for its response rejects.
 */
export type OpenRpcConnectionFunction = (stream: Duplex, handle: RpcHandler) => RpcConnection;
