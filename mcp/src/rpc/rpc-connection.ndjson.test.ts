import assert from 'node:assert/strict';
import { on } from 'node:events';
import { createInterface } from 'node:readline';
import { type Duplex, duplexPair } from 'node:stream';
import { describe, it, type TestContext } from 'node:test';
import type { RpcErrorObject, RpcHandler, RpcId } from './message.ts';
import { ndjsonOpenRpcConnection } from './rpc-connection.ndjson.ts';
import type { RpcConnection } from './rpc-connection.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Message that the connection sent on one line, as the far end reads it.
 */
interface SentLine {
  /**
   * Identifier of the request or of the response, if any.
   */
  readonly id?: RpcId | null;

  /**
   * Name of the method of a request.
   */
  readonly method?: string;

  /**
   * Result of a response that reports one.
   */
  readonly result?: unknown;

  /**
   * Failure of a response that reports one.
   */
  readonly error?: RpcErrorObject;
}

/**
 * Far end of a connection of a test, which writes and reads the raw lines of the stream.
 */
interface RawEnd {
  /**
   * Writes `message` as one line of JSON, or the text `message` as it is.
   */
  send(message: object | string): void;

  /**
   * Returns the next line that the connection sent, parsed as JSON.
   */
  next(): Promise<SentLine>;
}

/**
 * Connection of a test with the far end of its stream.
 */
interface OpenedConnection {
  /**
   * Connection under test.
   */
  readonly connection: RpcConnection;

  /**
   * Stream that the connection runs over.
   */
  readonly stream: Duplex;

  /**
   * Far end of the stream.
   */
  readonly raw: RawEnd;
}

/**
 * Handler that answers each request with its params as the result, and each notification with nothing.
 */
const ECHO: RpcHandler = async (message) => {
  if (!isRequest(message) || message.id === undefined) return undefined;
  return { jsonrpc: '2.0', id: message.id, result: message.params ?? null };
};

/**
 * Returns whether `message` is an object with an optional identifier and optional params, as a request of the tests.
 */
const isRequest = (message: unknown): message is { readonly id?: RpcId; readonly params?: unknown } =>
  typeof message === 'object' && message !== null;

/**
 * Returns the name of the method of the request `message`, or `undefined` for a message without one.
 */
const methodOf = (message: unknown): unknown =>
  typeof message === 'object' && message !== null && 'method' in message ? message.method : undefined;

/**
 * Opens a connection with `handle` over one end of a new in-memory stream pair, and returns it with the far end. Both
 * ends are destroyed once the test `context` ends.
 */
const open = (context: TestContext, handle: RpcHandler = ECHO): OpenedConnection => {
  const [stream, far] = duplexPair();
  const connection = ndjsonOpenRpcConnection(stream, handle);
  const lines = createInterface({ input: far, crlfDelay: Number.POSITIVE_INFINITY });
  const received = on(lines, 'line');
  context.after(() => {
    lines.close();
    stream.destroy();
    far.destroy();
  });
  const raw: RawEnd = {
    send: (message) => {
      far.write(typeof message === 'string' ? message : `${JSON.stringify(message)}\n`);
    },
    next: async () => {
      const { value: [line] = [] } = await received.next();
      return JSON.parse(line);
    },
  };
  return { connection, stream, raw };
};

describe('ndjsonOpenRpcConnection', () => {
  it('sends a request as one line of JSON with the next id', async (context) => {
    const { connection, raw } = open(context);
    const results = Promise.all([connection.request('echo', { text: 'first' }), connection.request('echo')]);
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 1, method: 'echo', params: { text: 'first' } });
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 2, method: 'echo' });
    raw.send({ jsonrpc: '2.0', id: 1, result: 'one' });
    raw.send({ jsonrpc: '2.0', id: 2, result: 'two' });
    assert.deepEqual(await results, ['one', 'two']);
  });

  it('resolves a request with the result of its response', async (context) => {
    const { connection, raw } = open(context);
    const result = connection.request('echo', { text: 'hello' });
    const { id } = await raw.next();
    raw.send({ jsonrpc: '2.0', id, result: { text: 'hello' } });
    assert.deepEqual(await result, { text: 'hello' });
  });

  it('rejects a request whose response reports a failure with its RpcError', async (context) => {
    const { connection, raw } = open(context);
    const result = connection.request('refuse');
    const { id } = await raw.next();
    raw.send({ jsonrpc: '2.0', id, error: { code: 7, message: 'The count is too large', data: { limit: 3 } } });
    await assert.rejects(result, RpcError);
    await assert.rejects(result, { code: 7, message: 'The count is too large', data: { limit: 3 } });
  });

  it('runs between two connections over both ends of a stream', async (context) => {
    const [first, second] = duplexPair();
    context.after(() => {
      first.destroy();
      second.destroy();
    });
    const client = ndjsonOpenRpcConnection(first, ECHO);
    ndjsonOpenRpcConnection(second, ECHO);
    assert.deepEqual(await client.request('echo', { text: 'hello' }), { text: 'hello' });
  });

  it('answers a received request with the response of the handler', async (context) => {
    const { raw } = open(context);
    raw.send({ jsonrpc: '2.0', id: 'a', method: 'echo', params: { text: 'hello' } });
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 'a', result: { text: 'hello' } });
  });

  it('sends nothing for a message that the handler answers with undefined', async (context) => {
    const { raw } = open(context);
    raw.send({ jsonrpc: '2.0', method: 'echo', params: { text: 'notice' } });
    raw.send({ jsonrpc: '2.0', id: 2, method: 'echo', params: { text: 'request' } });
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 2, result: { text: 'request' } });
  });

  it('answers a line that is not valid JSON with a parse error and the id null', async (context) => {
    const { raw } = open(context);
    raw.send('{not json\n');
    const response = await raw.next();
    assert.equal(response.id, null);
    assert.equal(response.error?.code, RPC_ERROR_CODES.PARSE_ERROR);
  });

  it('skips a blank line', async (context) => {
    const { raw } = open(context);
    raw.send('  \n');
    raw.send({ jsonrpc: '2.0', id: 1, method: 'echo', params: { text: 'after' } });
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 1, result: { text: 'after' } });
  });

  it('reads a line that ends with a carriage return and a line feed', async (context) => {
    const { raw } = open(context);
    raw.send(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'echo', params: { text: 'crlf' } })}\r\n`);
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 1, result: { text: 'crlf' } });
  });

  it('drops a response to no waiting request without a call of the handler', async (context) => {
    const handled: unknown[] = [];
    const { connection, raw } = open(context, async (message) => {
      handled.push(message);
      return ECHO(message);
    });
    raw.send({ jsonrpc: '2.0', id: 99, result: 'stray' });
    const result = connection.request('echo');
    const { id } = await raw.next();
    raw.send({ jsonrpc: '2.0', id, result: 'answer' });
    assert.equal(await result, 'answer');
    assert.deepEqual(handled, []);
  });

  it('answers a later message before a slow method of an earlier one ends', async (context) => {
    const { promise: slowDone, resolve: endSlow } = Promise.withResolvers<void>();
    const { raw } = open(context, async (message) => {
      if (methodOf(message) === 'slow') await slowDone;
      return ECHO(message);
    });
    raw.send({ jsonrpc: '2.0', id: 1, method: 'slow', params: { text: 'slow' } });
    raw.send({ jsonrpc: '2.0', id: 2, method: 'fast', params: { text: 'fast' } });
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 2, result: { text: 'fast' } });
    endSlow();
    assert.deepEqual(await raw.next(), { jsonrpc: '2.0', id: 1, result: { text: 'slow' } });
  });

  it('rejects each waiting request once the stream closes', async (context) => {
    const { connection, stream, raw } = open(context);
    const result = connection.request('echo');
    await raw.next();
    stream.destroy();
    await assert.rejects(result, { message: 'The connection closed' });
  });

  it('resolves closed once the stream closes', async (context) => {
    const { connection, stream } = open(context);
    stream.destroy();
    assert.equal(await connection.closed, undefined);
  });

  it('ends the stream on close', (context) => {
    const { connection, stream } = open(context);
    connection.close();
    assert.equal(stream.writableEnded, true);
  });

  it('rejects a request after close without sending it', async (context) => {
    const { connection } = open(context);
    connection.close();
    await assert.rejects(connection.request('echo'), { message: 'The connection is closed' });
  });

  it('rejects a request whose signal aborted before it was sent', async (context) => {
    const { connection } = open(context);
    const signal = AbortSignal.abort(new Error('Too late'));
    await assert.rejects(
      connection.request('echo', {}, signal),
      (error) =>
        error instanceof Error && error.message === 'The request echo was aborted' && error.cause === signal.reason,
    );
  });

  it('rejects a waiting request once its signal aborts, and drops its later response', async (context) => {
    const { connection, raw } = open(context);
    const controller = new AbortController();
    const result = connection.request('echo', {}, controller.signal);
    const { id } = await raw.next();
    controller.abort();
    await assert.rejects(result, { message: 'The request echo was aborted' });
    raw.send({ jsonrpc: '2.0', id, result: 'late' });
    const next = connection.request('echo');
    const { id: nextId } = await raw.next();
    raw.send({ jsonrpc: '2.0', id: nextId, result: 'next' });
    assert.equal(await next, 'next');
  });
});
