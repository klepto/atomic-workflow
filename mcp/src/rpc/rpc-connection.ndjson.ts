import { createInterface } from 'node:readline';
import type { Duplex } from 'node:stream';
import type { RpcHandler, RpcId, RpcResponse } from './message.ts';
import type { OpenRpcConnectionFunction } from './rpc-connection.ts';
import { RpcError, RpcErrorCode } from './rpc-error.ts';

/**
 * Request that waits for its response.
 */
interface PendingRequest {
  /**
   * Settles the request with the result `result` of its response.
   */
  resolve(result: unknown): void;

  /**
   * Settles the request with the failure `error`.
   */
  reject(error: Error): void;
}

/**
 * State of one connection.
 */
interface Connection {
  /**
   * Stream that the connection runs over.
   */
  readonly stream: Duplex;

  /**
   * Requests of this end that wait for their response, by identifier.
   */
  readonly pending: Map<RpcId, PendingRequest>;

  /**
   * Identifier of the next request of this end.
   */
  nextId: number;
}

/**
 * `OpenRpcConnectionFunction` that sends one message per line of JSON. Each message that `handle` answers is answered
 * on its own, so a slow method does not hold up the messages that follow it.
 */
export const ndjsonOpenRpcConnection: OpenRpcConnectionFunction = (stream, handle) => {
  const connection: Connection = { stream, pending: new Map(), nextId: 1 };
  // An error of the stream is followed by its close, which `closed` reports.
  stream.on('error', () => {});
  const closed = new Promise<void>((resolve) => stream.once('close', () => resolve()));
  void closed.then(() => rejectPending(connection));
  createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
    void receive(connection, handle, line);
  });
  return {
    request: (method, params, signal) => request(connection, method, params, signal),
    closed,
    close: () => stream.end(),
  };
};

/**
 * Rejects every request of `connection` that still waits for its response, since the connection has closed.
 */
const rejectPending = (connection: Connection): void => {
  for (const request of connection.pending.values()) request.reject(new Error('The connection closed'));
};

/**
 * Sends the request of the method `method` with the parameters `params` over `connection`, and returns the result of
 * its response.
 */
const request = (connection: Connection, method: string, params?: object, signal?: AbortSignal): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    if (!connection.stream.writable) return reject(new Error('The connection is closed'));
    if (signal?.aborted) return reject(abortError(method, signal.reason));
    const id = connection.nextId;
    connection.nextId += 1;
    const abort = (): void => connection.pending.get(id)?.reject(abortError(method, signal?.reason));
    const finish = (): void => {
      connection.pending.delete(id);
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });
    connection.pending.set(id, {
      resolve: (result) => {
        finish();
        resolve(result);
      },
      reject: (error) => {
        finish();
        reject(error);
      },
    });
    send(connection, { jsonrpc: '2.0', id, method, params });
  });
};

/**
 * Returns the failure of a request of the method `method` that was aborted for the reason `reason`.
 */
const abortError = (method: string, reason: unknown): Error => {
  return new Error(`The request ${method} was aborted`, { cause: reason });
};

/**
 * Answers the line `line` that `connection` received. A response settles the request of this end that it answers,
 * and `handle` answers any other message.
 */
const receive = async (connection: Connection, handle: RpcHandler, line: string): Promise<void> => {
  if (line.trim() === '') return;
  const message = parseCatching(line);
  if (message instanceof Error)
    return send(connection, new RpcError(RpcErrorCode.PARSE_ERROR, message.message).toResponse(null));
  if (isResponse(message)) return settle(connection, message);
  const response = await handle(message);
  if (response !== undefined) send(connection, response);
};

/**
 * Returns the JSON value in the text `line`, or the error when `line` is not valid JSON.
 */
const parseCatching = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

/**
 * Returns whether `message` is a response rather than a request.
 */
const isResponse = (message: unknown): message is RpcResponse => {
  if (typeof message !== 'object' || message === null || 'method' in message) return false;
  return 'result' in message || 'error' in message;
};

/**
 * Settles the request of `connection` that `response` answers. A response to no waiting request is dropped.
 */
const settle = (connection: Connection, response: RpcResponse): void => {
  const request = response.id === null ? undefined : connection.pending.get(response.id);
  if (request === undefined) return;
  if ('error' in response) request.reject(RpcError.of(response.error));
  else request.resolve(response.result);
};

/**
 * Sends `message` over `connection` as one line of JSON, unless the connection no longer sends.
 */
const send = (connection: Connection, message: object): void => {
  if (connection.stream.writable) connection.stream.write(`${JSON.stringify(message)}\n`);
};
