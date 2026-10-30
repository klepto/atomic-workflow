import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { activate } from './activate.ts';
import { listSkills } from './follow-sessions.ts';
import { followSubagent } from './follow-subagent.ts';
import type { Session, SessionDependencies, SessionOptions } from './session.ts';

/**
 * Name of the MCP server, under which a session sees its tools.
 */
const SERVER_NAME = 'atomic-workflow';

/**
 * Returns the MCP server of one Claude Code session, with `options` and `dependencies`, which the caller connects to
 * its transport. The server lies dormant until the tool `activate` attaches it to the repository server of the
 * project. While attached, it offers one tool per method of `METHODS` that agents can call, and answers the methods
 * of `SESSION_METHODS` of the repository server. The agent receives the messages of the repository server with a
 * command that it runs in the background, which `activate` names.
 */
export const createSessionServer = (options: SessionOptions, dependencies: SessionDependencies): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version: '0.0.0' });
  const session: Session = {
    options,
    dependencies,
    server,
    context: {
      followSubagent: (sessionId, parentId, oneShot) => followSubagent(session, sessionId, parentId, oneShot),
      listSkills: (sessionId) => listSkills(session, sessionId),
      subagentTaskId: (sessionId) => session.subagentTasks.get(sessionId),
    },
    attachment: undefined,
    transcript: undefined,
    skills: new Map(),
    subagentTasks: new Map(),
  };
  server.registerTool(
    'activate',
    { description: 'Activates the atomic workflow of this repository. Call it only when a skill tells you to.' },
    () => activate(session),
  );
  return server;
};
