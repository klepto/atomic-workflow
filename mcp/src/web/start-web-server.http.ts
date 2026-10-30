import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';
import type { ChangeFeed } from '../changes/change-feed.ts';
import { errorMessage } from '../rpc/error-message.ts';
import type { RpcHandler } from '../rpc/message.ts';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';
import type { StartWebServerFunction, WebServerDependencies } from './start-web-server.ts';
import type { StaticAnswer, StaticFile } from './static-files.ts';

/**
 * Host that the web server listens on. Only processes of the local machine reach it.
 */
const HOST = '127.0.0.1';

/**
 * Path that takes JSON-RPC 2.0 messages, one per `POST` request.
 */
const RPC_PATH = '/rpc';

/**
 * Media type that a `POST` to `RPC_PATH` must declare. A web page of another origin cannot send it without the consent
 * of the web server, which it never gives.
 */
const RPC_TYPE = 'application/json';

/**
 * Path that streams the changes of the change feed as Server-Sent Events, one stream per `GET` request.
 */
const EVENTS_PATH = '/events';

/**
 * Text of the answer to a path of the web app while its directory has no `index.html`.
 */
const NOT_BUILT = 'The web app is not built. Run npm run build in web/.';

/**
 * `StartWebServerFunction` that serves over HTTP on a port that the system picks, with the routes of its dependencies.
 *
 * The web server answers a JSON-RPC 2.0 message in the body of a `POST` to `/rpc` with the response in the body of
 * its answer. A message must come as JSON, so a web page of another origin cannot send one. A `GET` of `/events`
 * opens a stream of Server-Sent Events, which sends `event: <resource>` with empty data for each change of the change
 * feed of its dependencies, until the client closes it or the web server stops. A `GET` of any other path answers
 * with the file of the web app that the path names, or with `index.html` when it names none. Only requests to the
 * host and port of its URL are answered, at every path, so a host name that resolves to the local host does not reach
 * it.
 * If the server cannot listen, rejects with the error of the server.
 */
export const httpStartWebServer: StartWebServerFunction = async (dependencies) => {
  const server = createServer((request, response) => void serve(dependencies, request, response));
  await listen(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://${HOST}:${port}/`, close: () => close(server) };
};

/**
 * Answers `request` with `response`, as `route` does. A failure of `route` is answered with `500` and its message, or
 * ends the connection once the answer has begun, so it does not end the process.
 */
const serve = async (
  routes: WebServerDependencies,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  try {
    await route(routes, request, response);
  } catch (error) {
    if (response.headersSent) return void response.destroy();
    respond(response, 500, 'text/plain', errorMessage(error));
  }
};

/**
 * Answers `request` with `response`, by its host, its path and its method: `421` to another host than the one of the
 * web server, the answer of `handle` of `routes` at `RPC_PATH`, `405` to any method other than `GET` at every other
 * path, the stream of the change feed of `routes` to a `GET` of `EVENTS_PATH`, and the answer of the static files of
 * `routes` to a `GET` of any other path.
 */
const route = async (
  routes: WebServerDependencies,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const { pathname } = new URL(request.url ?? '/', `http://${HOST}`);
  if (request.headers.host !== `${HOST}:${request.socket.localPort}`)
    return void respond(response, 421, 'text/plain', 'Unknown host');
  if (pathname === RPC_PATH) return routeRpc(routes.handle, request, response);
  if (request.method !== 'GET') return void respond(response, 405, 'text/plain', 'Only GET is allowed');
  if (pathname === EVENTS_PATH) return streamEvents(routes.changes, response);
  // The path as it was sent, since the path of the URL already has its `..` and its `%2e%2e` resolved.
  respondStatic(response, await routes.staticFiles.find(sentPath(request.url ?? '/')));
};

/**
 * Answers `request` to `RPC_PATH` with `response`: `405` to any method other than `POST`, `415` to a body that is not
 * declared as `RPC_TYPE`, and else the response of `handle` to the message of the body.
 */
const routeRpc = async (handle: RpcHandler, request: IncomingMessage, response: ServerResponse): Promise<void> => {
  if (request.method !== 'POST') return void respond(response, 405, 'text/plain', 'Only POST is allowed');
  if (request.headers['content-type']?.split(';')[0]?.trim() !== RPC_TYPE)
    return void respond(response, 415, 'text/plain', `Only ${RPC_TYPE} is allowed`);
  const answer = await call(handle, await text(request));
  if (answer === undefined) return void respond(response, 204);
  respond(response, 200, 'application/json', JSON.stringify(answer));
};

/**
 * Answers a `GET` of `EVENTS_PATH` with `response`, a stream of Server-Sent Events: `200` with the headers sent at
 * once, so the client opens the stream, then `event: <resource>` with empty data for each change of `changes`. The
 * subscription to `changes` ends when the response closes, which `close` of the web server brings about as well.
 */
const streamEvents = (changes: ChangeFeed, response: ServerResponse): void => {
  response.setHeader('content-type', 'text/event-stream');
  response.setHeader('cache-control', 'no-store');
  response.writeHead(200);
  response.flushHeaders();
  const unsubscribe = changes.subscribe((resource) => void response.write(`event: ${resource}\ndata:\n\n`));
  response.once('close', unsubscribe);
};

/**
 * Returns the path of `url`, the path and query of a request, as it was sent: without its query, and not decoded.
 */
const sentPath = (url: string): string => {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
};

/**
 * Ends `response` with `staticAnswer`: `200` with the file of a `file` or a `fallback`, `400` with the message of a
 * `refused`, and `503` with `NOT_BUILT` for a `missing`.
 */
const respondStatic = (response: ServerResponse, staticAnswer: StaticAnswer): void => {
  if (staticAnswer.kind === 'refused') respond(response, 400, 'text/plain', staticAnswer.message);
  else if (staticAnswer.kind === 'missing') respond(response, 503, 'text/plain', NOT_BUILT);
  else respondFile(response, staticAnswer.file);
};

/**
 * Ends `response` with the status `200` and `file`: its bytes, its content type as it is, and its cache rule as
 * `Cache-Control` when it has one.
 */
const respondFile = (response: ServerResponse, file: StaticFile): void => {
  response.setHeader('content-type', file.contentType);
  if (file.cacheControl !== undefined) response.setHeader('cache-control', file.cacheControl);
  response.writeHead(200);
  response.end(file.content);
};

/**
 * Returns the response of `handle` to the JSON-RPC 2.0 message in the text `body`, or `undefined` for a notification.
 * A body that is not valid JSON gets a response that reports a parse error.
 */
const call = async (handle: RpcHandler, body: string): ReturnType<RpcHandler> => {
  try {
    return handle(JSON.parse(body));
  } catch (error) {
    return new RpcError(RPC_ERROR_CODES.PARSE_ERROR, errorMessage(error)).toResponse(null);
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
 * Starts `server` listening on a free port of `HOST`, and resolves once it listens. If it cannot listen, rejects with
 * the error of `server`.
 */
const listen = async (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
};

/**
 * Stops `server` and ends its open connections, and resolves once it has stopped. If `server` fails to stop, rejects
 * with its error.
 */
const close = async (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });
};
