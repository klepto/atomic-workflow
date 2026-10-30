import type { ChangeFeed } from '../changes/change-feed.ts';
import type { RpcHandler } from '../rpc/message.ts';
import type { StaticFiles } from './static-files.ts';

/**
 * Running web server.
 */
interface WebServer {
  /**
   * URL of the web server.
   */
  readonly url: string;

  /**
   * Stops the web server and ends its open connections, and resolves once it has stopped.
   * If the web server fails to stop, such as when it does not run, rejects.
   */
  close(): Promise<void>;
}

/**
 * Dependencies of a web server.
 */
export interface WebServerDependencies {
  /**
   * Function that answers each JSON-RPC 2.0 message that the web server receives.
   */
  readonly handle: RpcHandler;

  /**
   * Feed of the changes of the repository server, which the web server streams to each client of its event stream.
   */
  readonly changes: ChangeFeed;

  /**
   * Files of the web app, which the web server serves at every other path.
   */
  readonly staticFiles: StaticFiles;
}

/**
 * Function that starts a web server on a free port of the local host, and returns it once it listens. The web server
 * answers each JSON-RPC 2.0 message that it receives with `handle` of `dependencies`, streams the changes of their
 * feed as Server-Sent Events, and serves their static files at every other path.
 * If the web server cannot listen, rejects.
 */
export type StartWebServerFunction = (dependencies: WebServerDependencies) => Promise<WebServer>;
