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
 * Media type that a `POST` to `RPC_PATH` must declare. A web page of another origin cannot send it without the consent
 * of the web server, which it never gives.
 */
const RPC_TYPE = 'application/json';

/**
 * Number of the latest messages that the page shows when it opens.
 */
const LATEST_LIMIT = 100;

/**
 * Time in ms between two checks of the page for messages that were logged since the last one.
 */
const REFRESH_INTERVAL = 2_000;

/**
 * Page that the web server serves at its root. It shows the latest messages of the message log, newest first, and
 * adds the messages that are logged later every `REFRESH_INTERVAL` ms. Above the log, a form delivers a message to an
 * attached session, the latest attached one unless another is picked. The list of attached sessions is refreshed with
 * the log. Content is set as text, never as HTML.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>atomic-workflow</title>
<style>
  :root { color-scheme: light dark; --muted: #888; --line: #8884; --user: #2a7ae2; --agent: #2e9d5b; }
  body { margin: 0 auto; max-width: 56rem; padding: 1.5rem; font: 15px/1.5 system-ui, sans-serif; }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  #status { color: var(--muted); }
  article { border-top: 1px solid var(--line); padding: 0.75rem 0; }
  header { display: flex; gap: 0.75rem; align-items: baseline; font-size: 0.85rem; color: var(--muted); }
  .sender { font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .user .sender { color: var(--user); }
  .agent .sender { color: var(--agent); }
  .session { font-family: ui-monospace, monospace; }
  .content { margin: 0.25rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  form { display: grid; gap: 0.5rem; margin: 0 0 1.5rem; }
  form .row { display: flex; gap: 0.75rem; align-items: center; }
  select, textarea, button { font: inherit; }
  select { font-family: ui-monospace, monospace; }
  textarea { box-sizing: border-box; width: 100%; min-height: 5rem; padding: 0.5rem; resize: vertical; }
  #delivery { color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Send a message</h1>
<form id="send">
  <textarea id="content" placeholder="Message to the session. Ctrl+Enter sends." required></textarea>
  <div class="row">
    <select id="target" title="Attached session" disabled></select>
    <button id="submit" type="submit" disabled>Send</button>
    <span id="delivery"></span>
  </div>
</form>
<h1>Message log</h1>
<p id="status">Loading…</p>
<main id="messages"></main>
<script>
const list = document.getElementById('messages');
const status = document.getElementById('status');
const form = document.getElementById('send');
const content = document.getElementById('content');
const target = document.getElementById('target');
const submit = document.getElementById('submit');
const delivery = document.getElementById('delivery');
let last;
let sending = false;

const call = async (method, params) => {
  const request = { jsonrpc: '2.0', id: 1, method, params };
  const response = await fetch('${RPC_PATH}', {
    method: 'POST',
    headers: { 'content-type': '${RPC_TYPE}' },
    body: JSON.stringify(request),
  });
  const answer = await response.json();
  if (answer.error) throw new Error(answer.error.message);
  return answer.result;
};

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const render = (message) => {
  const session = element('span', 'session', message.sessionId.slice(0, 8));
  session.title = message.sessionId;
  const header = document.createElement('header');
  header.append(
    element('span', 'sender', message.sender),
    element('time', 'time', new Date(message.timestamp).toLocaleString()),
    session,
  );
  const article = element('article', message.sender, '');
  article.append(header, element('p', 'content', message.content));
  return article;
};

const option = (sessionId) => {
  const node = element('option', '', sessionId.slice(0, 8));
  node.value = sessionId;
  node.title = sessionId;
  return node;
};

const showTargets = (sessionIds) => {
  const picked = target.value;
  const latest = sessionIds[sessionIds.length - 1];
  target.replaceChildren(...sessionIds.slice().reverse().map(option));
  target.value = sessionIds.includes(picked) ? picked : (latest ?? '');
  target.disabled = sessionIds.length === 0;
  submit.disabled = sessionIds.length === 0 || sending;
  if (sessionIds.length === 0) target.replaceChildren(element('option', '', 'No attached session'));
};

const refreshTargets = async () => {
  try {
    const { sessionIds } = await call('listAttachedSessions', {});
    showTargets(sessionIds);
  } catch (error) {
    showTargets([]);
    delivery.textContent = 'Could not load the attached sessions: ' + error.message;
  }
};

const send = async () => {
  if (sending || target.disabled || content.value.trim() === '') return;
  sending = true;
  submit.disabled = true;
  delivery.textContent = 'Sending…';
  try {
    await call('deliverMessage', { sessionId: target.value, content: content.value });
    content.value = '';
    delivery.textContent = 'Delivered at ' + new Date().toLocaleTimeString() + '.';
  } catch (error) {
    delivery.textContent = 'Could not deliver the message: ' + error.message;
  } finally {
    sending = false;
    submit.disabled = target.disabled;
  }
};

form.addEventListener('submit', (event) => {
  event.preventDefault();
  send();
});

content.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  send();
});

const refresh = async () => {
  await refreshTargets();
  try {
    const params = last === undefined ? { limit: ${LATEST_LIMIT} } : { after: last, limit: 1000 };
    const { messages } = await call('listMessages', params);
    for (const message of messages) list.prepend(render(message));
    last = messages.length > 0 ? messages[messages.length - 1].id : (last ?? 0);
    status.textContent = list.childElementCount === 0 ? 'No messages yet.' : '';
  } catch (error) {
    status.textContent = 'Could not load the messages: ' + error.message;
  }
  setTimeout(refresh, ${REFRESH_INTERVAL});
};

refresh();
</script>
</body>
</html>
`;

/**
 * `StartWebServerFunction` that serves over HTTP on a port that the system picks. It serves the page at `/`, and
 * answers a JSON-RPC 2.0 message in the body of a `POST` to `/rpc` with the response in the body of its answer. Only
 * requests to the host and port of its URL are answered, so a host name that resolves to the local host does not
 * reach it, and a message must come as JSON, so a web page of another origin cannot send one.
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
  if (request.headers.host !== `${HOST}:${request.socket.localPort}`)
    return void respond(response, 421, 'text/plain', 'Unknown host');
  if (pathname === '/' && request.method === 'GET') return void respond(response, 200, 'text/html', PAGE);
  if (pathname !== RPC_PATH) return void respond(response, 404, 'text/plain', 'Not found');
  if (request.method !== 'POST') return void respond(response, 405, 'text/plain', 'Only POST is allowed');
  if (request.headers['content-type']?.split(';')[0]?.trim() !== RPC_TYPE)
    return void respond(response, 415, 'text/plain', `Only ${RPC_TYPE} is allowed`);
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
