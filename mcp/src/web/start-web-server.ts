import type { RpcHandler } from '../rpc/message.ts';
import { httpStartWebServer } from './start-web-server.http.ts';

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
 * Function that starts a web server on a free port of the local host, and returns it once it listens. The web server
 * answers each JSON-RPC 2.0 message that it receives with `handle`.
 */
export type StartWebServerFunction = (handle: RpcHandler) => Promise<WebServer>;

/**
 * Default `StartWebServerFunction`, which serves over HTTP.
 */
export const StartWebServer: StartWebServerFunction = httpStartWebServer;
