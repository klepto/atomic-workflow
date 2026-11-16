import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { text } from 'node:stream/consumers';
import type { PerfFixture } from './fixture.ts';

/**
 * Stub of the web server of a repository server, which serves the built web app and answers its RPC calls from a
 * fixture.
 */
export interface StubServer {
  /**
   * URL of the server, such as `http://127.0.0.1:51234/`.
   */
  readonly url: string;

  /**
   * Stops the server and ends its open connections, such as the stream of events.
   */
  readonly close: () => Promise<void>;
}

/**
 * Content type of each extension of a file of the built web app.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Host that the stub listens on.
 */
const HOST = '127.0.0.1';

/**
 * Code of the JSON-RPC 2.0 error for a body that is not JSON.
 */
const PARSE_ERROR = -32700;

/**
 * Code of the JSON-RPC 2.0 error for a method that the stub does not answer.
 */
const METHOD_NOT_FOUND = -32601;

/**
 * Returns the field `key` of `value`, or `undefined` when `value` is no object or has no such field.
 */
const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;

/**
 * Returns the result of the RPC method `method` with the parameters `params` from `fixture`: the answers that the page
 * reads to show the review of the fixture ticket. Returns `undefined` for any other method, and for the patch of a file
 * that is not big.
 */
const resultOf = (fixture: PerfFixture, method: unknown, params: unknown): unknown => {
  switch (method) {
    case 'repositoryGet':
      return fixture.repository;
    case 'sessionList':
      return { sessions: [] };
    case 'taskList':
      return { tasks: [fixture.task] };
    case 'permissionPromptList':
      return { prompts: [] };
    case 'usageGet':
      return fixture.usage;
    case 'taskGet':
      return fixture.detail;
    case 'ticketDiff':
      return fixture.changes;
    case 'ticketFileDiff': {
      const path = fieldOf(params, 'path');
      const patch = typeof path === 'string' ? fixture.bigPatches.get(path) : undefined;
      return patch === undefined ? undefined : { patch };
    }
    default:
      return undefined;
  }
};

/**
 * Returns the JSON-RPC 2.0 response to the request in `body`, from `fixture`: its result, or an error for a body that
 * is not JSON and for a method that the stub does not answer.
 */
const answerRpc = (fixture: PerfFixture, body: string): object => {
  let request: unknown;
  try {
    request = JSON.parse(body);
  } catch {
    return { jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'The body is not JSON' } };
  }
  const id = fieldOf(request, 'id') ?? null;
  const method = fieldOf(request, 'method');
  const result = resultOf(fixture, method, fieldOf(request, 'params'));
  if (result === undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: METHOD_NOT_FOUND, message: `The stub does not answer ${String(method)}` },
    };
  }
  return { jsonrpc: '2.0', id, result };
};

/**
 * Returns the path below `directory` of the file that the URL path `pathname` names, or `undefined` when it names
 * none: the root, a path that does not decode, or a path that leaves `directory`.
 */
const filePathOf = (directory: string, pathname: string): string | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/, '');
  return relative === '' || relative.startsWith('..') ? undefined : join(directory, relative);
};

/**
 * Answers `request` with the file of `directory` that its path names, or with `index.html` when it names none, as the
 * web server of a repository server does. Answers `404` while `directory` has no `index.html`.
 */
const serveFile = async (directory: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const { pathname } = new URL(request.url ?? '/', `http://${HOST}`);
  const named = filePathOf(directory, pathname);
  for (const path of [...(named === undefined ? [] : [named]), join(directory, 'index.html')]) {
    // A path that names no readable file is a path of the app, which `index.html` answers.
    const content = await readFile(path).catch(() => undefined);
    if (content === undefined) continue;
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' });
    response.end(content);
    return;
  }
  response.writeHead(404);
  response.end();
};

/**
 * Starts a stub server on a free port of the local host that serves the built web app in `directory`, answers each
 * JSON-RPC 2.0 request to `/rpc` from `fixture`, and holds the stream of `/events` open without events, so the page
 * neither reads again nor opens the stream again. Rejects when the server cannot listen.
 */
export const startStubServer = async (directory: string, fixture: PerfFixture): Promise<StubServer> => {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', `http://${HOST}`);
    if (pathname === '/rpc') {
      text(request).then(
        (body) => {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(answerRpc(fixture, body)));
        },
        // A request whose body broke off has no client left to answer.
        () => response.destroy(),
      );
      return;
    }
    if (pathname === '/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      response.flushHeaders();
      return;
    }
    void serveFile(directory, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${HOST}:${port}/`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
};
