import { execFile } from 'node:child_process';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { buffer } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Logger, type Plugin } from 'vite';
import { errorMessage } from './src/lib/error-message.ts';

/**
 * Absolute path of the directory that the web app is built into: `plugin/dist/web/`, which the server serves.
 */
const OUT_DIRECTORY = fileURLToPath(new URL('../plugin/dist/web', import.meta.url));

/**
 * Absolute path of the directory of the web app, which lies in the repository whose repository server the dev server
 * proxies to.
 */
const WEB_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute path of the entry point of the MCP server that prints the URL of the web server of the repository server of
 * the repository that holds its working directory.
 */
const WEB_URL_ENTRY = fileURLToPath(new URL('../mcp/src/web-url.main.ts', import.meta.url));

/**
 * Paths that the dev server sends on to the web server of the repository server.
 */
const SERVER_PATHS: readonly string[] = ['/rpc', '/events'];

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Returns `text` with every CRLF and every lone CR replaced by LF.
 */
const toLineFeeds = (text: string): string => text.replace(/\r\n?/g, '\n');

/**
 * Vite plugin that builds every text file with LF line endings. A Windows checkout holds the sources with CRLF line
 * endings. The sources get LF before any other plugin reads them, so the hashes in the names of the files are the same
 * on every system, and every text file of the output gets LF once more at the end.
 */
const lineFeedOutput = (): Plugin => ({
  name: 'line-feed-output',
  enforce: 'pre',
  transform: (code) => (code.includes('\r') ? { code: toLineFeeds(code), map: null } : null),
  transformIndexHtml: {
    order: 'pre',
    handler: toLineFeeds,
  },
  generateBundle: (_options, bundle) => {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk') {
        file.code = toLineFeeds(file.code);
      } else if (typeof file.source === 'string') {
        file.source = toLineFeeds(file.source);
      }
    }
  },
});

/**
 * Returns the standard error of the failed child process `error`, or `undefined` when `error` holds none.
 */
const stderrOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
    ? error.stderr
    : undefined;

/**
 * Returns the URL of the web server to proxy to: `ATOMIC_WORKFLOW_URL` when it is set, else the URL of the web server
 * of the repository server of this repository, which `WEB_URL_ENTRY` prints. If no repository server runs, rejects
 * with the message of `WEB_URL_ENTRY`.
 */
const findServerUrl = async (): Promise<URL> => {
  const fixedUrl = process.env.ATOMIC_WORKFLOW_URL;
  if (fixedUrl !== undefined && fixedUrl !== '') return new URL(fixedUrl);
  try {
    const { stdout } = await execFileAsync(process.execPath, [WEB_URL_ENTRY], {
      cwd: WEB_DIRECTORY,
      windowsHide: true,
    });
    return new URL(stdout.trim());
  } catch (error) {
    const message = stderrOf(error)?.trim() || String(error);
    throw new Error(`${message}. Run /atomic-workflow in a Claude Code session of this repository.`, { cause: error });
  }
};

/**
 * Sends `request` with the body `body` to the web server at `target`, with the host and the port of `target`, which
 * the web server checks, and streams its answer into `response`. Resolves once the answer has begun. If the web server
 * cannot be reached, rejects before anything is written to `response`. A failure once the answer has begun ends
 * `response`, and a close of `response` ends the request.
 */
const forward = async (target: URL, request: IncomingMessage, body: Buffer, response: ServerResponse): Promise<void> =>
  new Promise((resolve, reject) => {
    const upstream = httpRequest(new URL(request.url ?? '/', target), {
      method: request.method,
      headers: { ...request.headers, host: target.host },
    });
    upstream.on('error', (error) => (response.headersSent ? response.destroy() : reject(error)));
    upstream.once('response', (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      // Sends the headers at once, so the browser opens an event stream before its first event.
      response.flushHeaders();
      answer.pipe(response);
      resolve();
    });
    response.once('close', () => upstream.destroy());
    upstream.end(body);
  });

/**
 * Ends `response` for the failure `error` of a proxied request: with `502` and the message of `error` while nothing
 * was written yet, and by closing the connection otherwise.
 */
const respondFailure = (response: ServerResponse, error: unknown): void => {
  if (response.headersSent || response.destroyed) {
    response.destroy();
    return;
  }
  response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(errorMessage(error));
};

/**
 * Returns a Vite plugin that makes the dev server send every request to `SERVER_PATHS` on to the web server that
 * `findServerUrl` finds, and logs each URL that it finds with `logger` of the dev server. The URL is found at the first
 * such request and kept. While the kept URL answers no more, such as after the repository server restarted on another
 * port, the request finds the URL again and goes to it once more, so the dev server needs no restart.
 */
const repositoryServerProxy = (): Plugin => {
  let serverUrl: URL | undefined;
  let pendingUrl: Promise<URL> | undefined;

  /**
   * Finds the URL of the web server and keeps it, logging it with `logger` when it changed. Calls that overlap share
   * one search.
   */
  const refreshServerUrl = async (logger: Logger): Promise<URL> => {
    pendingUrl ??= findServerUrl().finally(() => {
      pendingUrl = undefined;
    });
    const found = await pendingUrl;
    if (serverUrl?.href !== found.href) logger.info(`Proxying /rpc and /events to ${found.href}`, { timestamp: true });
    serverUrl = found;
    return found;
  };

  /**
   * Sends `request` on to the web server and streams its answer into `response`: to the kept URL first, and to a URL
   * found again when the kept one cannot be reached or none is kept.
   */
  const proxy = async (logger: Logger, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = await buffer(request);
    if (serverUrl !== undefined) {
      const sent = await forward(serverUrl, request, body, response).then(
        () => true,
        () => false,
      );
      if (sent || response.destroyed) return;
    }
    await forward(await refreshServerUrl(logger), request, body, response);
  };

  return {
    name: 'repository-server-proxy',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use((request, response, next) => {
        const { pathname } = new URL(request.url ?? '/', 'http://localhost');
        if (!SERVER_PATHS.includes(pathname)) return next();
        proxy(server.config.logger, request, response).catch((error: unknown) => respondFailure(response, error));
      });
    },
  };
};

/**
 * Configuration of Vite for the web app: the dev server with its proxy to the repository server, and the build into
 * `plugin/dist/web/` with LF line endings.
 */
export default defineConfig({
  base: '/',
  plugins: [lineFeedOutput(), repositoryServerProxy(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: OUT_DIRECTORY,
    emptyOutDir: true,
    sourcemap: false,
    // The page allows no data URL but for images, so every asset stays a file of its own.
    assetsInlineLimit: 0,
    reportCompressedSize: false,
    // The main chunk is large on purpose, served from the local disk, so its size needs no warning. The highlighter and
    // its grammars load as chunks of their own, by the dynamic imports of src/lib/code-highlight.ts.
    chunkSizeWarningLimit: 1024,
  },
});
