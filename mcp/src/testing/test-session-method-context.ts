import type { SessionMethodContext } from '../rpc/session-method.ts';

/**
 * Returns a whole `SessionMethodContext` for a test: `followSubagent` does nothing, `listSkills` returns no skill, and
 * `subagentTaskId` knows no background task. Each field of `overrides` replaces its default.
 */
export const testSessionMethodContext = (overrides: Partial<SessionMethodContext> = {}): SessionMethodContext => ({
  followSubagent: () => undefined,
  listSkills: () => [],
  subagentTaskId: () => undefined,
  ...overrides,
});
