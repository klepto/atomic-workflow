import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Returns a tool result that holds the text `message`.
 */
export const textResult = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }] });

/**
 * Returns a tool result that reports a failure with the text `message`.
 */
export const failureResult = (message: string): CallToolResult => ({ ...textResult(message), isError: true });
