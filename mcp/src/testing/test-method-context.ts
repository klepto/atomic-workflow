import { mapCreateInboxes } from '../attachment/inboxes.map.ts';
import { mapCreatePermissionPrompts } from '../attachment/permission-prompts.map.ts';
import { mapCreateSessionActivity } from '../attachment/session-activity.map.ts';
import { mapCreateSessionConnections } from '../attachment/session-connections.map.ts';
import { mapCreateSubagents } from '../attachment/subagents.map.ts';
import { mapCreateTicketClaims } from '../attachment/ticket-claims.map.ts';
import type { MethodContext } from '../rpc/method.ts';
import { NO_USAGE_LIMITS } from '../usage/usage-limits.ts';
import type { Worktrees } from '../worktree/worktrees.ts';
import { testClock } from './test-clock.ts';
import { testStorage } from './test-storage.ts';

/**
 * Message of the error that each call of the default `worktrees` of `testMethodContext` rejects with.
 */
const NO_WORKTREES = 'The test gave no worktrees';

/**
 * `Worktrees` whose every call rejects with an `Error` of the message `NO_WORKTREES`, for a test that gives none.
 */
const NO_WORKTREES_GIVEN: Worktrees = {
  create: async () => rejectWorktrees(),
  merge: async () => rejectWorktrees(),
  ticketChanges: async () => rejectWorktrees(),
  ticketFilePatch: async () => rejectWorktrees(),
  unlandedTickets: async () => rejectWorktrees(),
  mergeTask: async () => rejectWorktrees(),
  taskLanding: async () => rejectWorktrees(),
  deleteTicket: async () => rejectWorktrees(),
  deleteTask: async () => rejectWorktrees(),
};

/**
 * Returns a whole `MethodContext` for a test: the stores of a new `testStorage`, new map adapters of the attachment,
 * a `testClock` at 0, session ids `session-1`, `session-2` and on, a timeout signal that never aborts, an await command
 * line `await <session id>`, the main worktree `/repository`, no caller, worktrees whose every call rejects, a usage
 * reader with no usage limits, and a usage refresher that does nothing. Each field of `overrides` replaces its default.
 */
export const testMethodContext = (overrides: Partial<MethodContext> = {}): MethodContext => {
  const storage = testStorage();
  let lastSessionNumber = 0;
  return {
    sessions: storage.sessions,
    messageLog: storage.messageLog,
    tasks: storage.tasks,
    sessionConnections: mapCreateSessionConnections(),
    subagents: mapCreateSubagents(),
    activity: mapCreateSessionActivity(),
    inboxes: mapCreateInboxes(),
    worktrees: NO_WORKTREES_GIVEN,
    ticketClaims: mapCreateTicketClaims(),
    prompts: mapCreatePermissionPrompts(),
    usage: { latest: () => NO_USAGE_LIMITS, stop: () => {} },
    usageRefresher: { request: () => {} },
    mainWorktree: '/repository',
    caller: undefined,
    awaitCommandLine: (sessionId) => `await ${sessionId}`,
    clock: testClock(),
    createSessionId: () => {
      lastSessionNumber += 1;
      return `session-${lastSessionNumber}`;
    },
    timeoutSignal: () => new AbortController().signal,
    ...overrides,
  };
};

/**
 * Throws the `Error` of the message `NO_WORKTREES`.
 */
const rejectWorktrees = (): never => {
  throw new Error(NO_WORKTREES);
};
