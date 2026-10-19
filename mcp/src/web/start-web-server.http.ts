import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';
import type { RpcHandler } from '../rpc/message.ts';
import { RpcError, RpcErrorCode } from '../rpc/rpc-error.ts';
import type { StartWebServerFunction } from './start-web-server.ts';

/**
 * Host that the web server listens on. Only processes of the local machine reach it.
 */
const HOST = '127.0.0.1';

/**
 * Path that takes JSON-RPC 2.0 messages, one per `POST` request.
 */
const RPC_PATH = '/rpc';

/**
 * Page that the web server serves at its root.
 */
const PAGE = [
  '<!doctype html>',
  '<html lang="en">',
  '<head><meta charset="utf-8"><title>atomic-workflow</title></head>',
  '<body>',
  '<h1>Hello world</h1>',
  '<form id="echo"><input name="message" value="Hello" required> <button>Echo</button></form>',
  '<pre id="response"></pre>',
  '<script>',
  "document.getElementById('echo').addEventListener('submit', async (event) => {",
  '  event.preventDefault();',
  "  const message = new FormData(event.target).get('message');",
  "  const request = { jsonrpc: '2.0', id: 1, method: 'echo', params: { message } };",
  `  const response = await fetch('${RPC_PATH}', { method: 'POST', body: JSON.stringify(request) });`,
  "  document.getElementById('response').textContent = JSON.stringify(await response.json(), null, 2);",
  '});',
  '</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

/**
 * `StartWebServerFunction` that serves over HTTP on a port that the system picks. It serves the page at `/`, and
 * answers a JSON-RPC 2.0 message in the body of a `POST` to `/rpc` with the response in the body of its answer.
 */
export const httpStartWebServer: StartWebServerFunction = async (handle) => {
  const server = createServer((request, response) => void route(handle, request, response));
  await listen(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://${HOST}:${port}/`, close: () => close(server) };
};

/**
 * Answers `request` with `response`, by its path and method.
 */
const route = async (handle: RpcHandler, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const { pathname } = new URL(request.url ?? '/', `http://${HOST}`);
  if (pathname === '/' && request.method === 'GET') return void respond(response, 200, 'text/html', PAGE);
  if (pathname !== RPC_PATH) return void respond(response, 404, 'text/plain', 'Not found');
  if (request.method !== 'POST') return void respond(response, 405, 'text/plain', 'Only POST is allowed');
  const answer = await call(handle, await text(request));
  if (answer === undefined) return void respond(response, 204);
  respond(response, 200, 'application/json', JSON.stringify(answer));
};

/**
 * Returns the response of `handle` to the JSON-RPC 2.0 message in the text `body`, or `undefined` for a notification.
 * A body that is not valid JSON gets a response that reports a parse error.
 */
const call = (handle: RpcHandler, body: string): ReturnType<RpcHandler> => {
  try {
    return handle(JSON.parse(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Promise.resolve(new RpcError(RpcErrorCode.PARSE_ERROR, message).toResponse(null));
  }
};

/**
 * Ends `response` with the status `status`, and with `body` of the media type `type` if given.
 */
const respond = (response: ServerResponse, status: number, type?: string, body?: string): void => {
  if (type !== undefined) response.setHeader('content-type', `${type}; charset=utf-8`);
  response.writeHead(status);
  response.end(body);
};

/**
 * Starts `server` listening on a free port of `HOST`, and resolves once it listens.
 */
const listen = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
};

/**
 * Stops `server` and ends its open connections, and resolves once it has stopped.
 */
const close = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });
};
