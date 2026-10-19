import type { Duplex } from 'node:stream';
import type { RpcHandler } from './message.ts';
import { ndjsonOpenRpcConnection } from './rpc-connection.ndjson.ts';

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
 * Function that opens a JSON-RPC 2.0 connection over `stream`, and answers each message that it receives with
 * `handle`.
 */
export type OpenRpcConnectionFunction = (stream: Duplex, handle: RpcHandler) => RpcConnection;

/**
 * Default `OpenRpcConnectionFunction`, which sends one message per line of JSON.
 */
export const OpenRpcConnection: OpenRpcConnectionFunction = ndjsonOpenRpcConnection;
