import type { ChangeFeed } from '../changes/change-feed.ts';
import type { RpcHandler } from '../rpc/message.ts';
import { httpStartWebServer } from './start-web-server.http.ts';
import { CreateStaticFiles } from './static-files.ts';

/**
 * Running web server.
 */
export interface WebServer {
  /**
   * URL of the web server.
   */
  readonly url: string;

  /**
   * Stops the web server and ends its open connections, and resolves once it has stopped.
   */
  close(): Promise<void>;
}

/**
 * Options of a web server.
 */
export interface WebServerOptions {
  /**
   * Absolute path of the directory of the web app, whose files the web server serves. It may not exist.
   */
  readonly directory: string;

  /**
   * Feed of the changes of the repository server, which the web server streams to each client of its event stream.
   */
  readonly changes: ChangeFeed;
}

/**
 * Function that starts a web server on a free port of the local host, and returns it once it listens. The web server
 * answers each JSON-RPC 2.0 message that it receives with `handle`, streams the changes of the feed of `options` as
 * Server-Sent Events, and serves the files of the web app in the directory of `options` at every other path.
 */
export type StartWebServerFunction = (handle: RpcHandler, options: WebServerOptions) => Promise<WebServer>;

/**
 * Default `StartWebServerFunction`, which serves over HTTP, and reads the files of the web app from disk.
 */
export const StartWebServer: StartWebServerFunction = httpStartWebServer(CreateStaticFiles);
