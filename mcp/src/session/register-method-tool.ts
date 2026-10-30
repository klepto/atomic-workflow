import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorMessage } from '../rpc/error-message.ts';
import type { Method } from '../rpc/method.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { failureResult, textResult } from './tool-result.ts';

/**
 * Offers `method` as a tool of `server` that calls it over `connection`, and returns the tool. The tool returns the
 * result of the method as JSON, or the message of its failure as a failure.
 */
export const registerMethodTool = (server: McpServer, connection: RpcConnection, method: Method): RegisteredTool =>
  server.registerTool(method.name, { description: method.description, inputSchema: method.params }, (params) =>
    callTool(connection, method.name, params),
  );

/**
 * Calls the method `name` with the parameters `params` over `connection`, and returns its result as a tool result
 * that holds the result as JSON. If the call fails, returns a tool result that reports its message instead.
 */
const callTool = async (connection: RpcConnection, name: string, params: object): Promise<CallToolResult> =>
  connection.request(name, params).then(
    (result) => textResult(JSON.stringify(result)),
    (error: unknown) => failureResult(errorMessage(error)),
  );
