import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { AttachedSubagent, CreateSubagentsFunction } from './subagents.ts';

/**
 * State of one started subagent.
 */
interface Subagent {
  /**
   * Identifier of the orchestrator session that the subagent runs inside.
   */
  readonly parentId: string;

  /**
   * Settles once the subagent attaches, and rejects when it goes away before.
   */
  readonly attached: PromiseWithResolvers<void>;

  /**
   * Whether the subagent has attached.
   */
  isAttached: boolean;
}

/**
 * `CreateSubagentsFunction` that keeps the subagents in a map, by session, in the order of their start.
 */
export const mapCreateSubagents: CreateSubagentsFunction = () => {
  const subagents = new Map<string, Subagent>();
  return {
    start: (sessionId, parentId, connection) => start(subagents, sessionId, parentId, connection),
    waitForAttach: (sessionId, signal) => waitForAttach(subagents.get(sessionId), sessionId, signal),
    attach: (sessionId) => attach(subagents.get(sessionId)),
    stop: (sessionId) => stop(subagents, sessionId),
    list: () => list(subagents),
  };
};

/**
 * Starts the subagent `sessionId` inside the orchestrator session `parentId` in `subagents`, until it is stopped or
 * `connection` closes.
 */
const start = (
  subagents: Map<string, Subagent>,
  sessionId: string,
  parentId: string,
  connection: RpcConnection,
): void => {
  const subagent: Subagent = { parentId, attached: Promise.withResolvers(), isAttached: false };
  // A subagent that goes away before it attaches rejects `attached`, which nobody may wait for.
  subagent.attached.promise.catch(() => undefined);
  subagents.set(sessionId, subagent);
  void connection.closed.then(() => {
    if (subagents.get(sessionId) === subagent) stop(subagents, sessionId);
  });
};

/**
 * Resolves once `subagent`, of the session `sessionId`, attaches. If `subagent` is `undefined`, goes away before it
 * attaches, or `signal` aborts first, rejects.
 */
const waitForAttach = (subagent: Subagent | undefined, sessionId: string, signal: AbortSignal): Promise<void> => {
  if (subagent === undefined) return Promise.reject(new Error(`No subagent ${sessionId} is started`));
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  return Promise.race([subagent.attached.promise, aborted]);
};

/**
 * Attaches `subagent`. If `subagent` is `undefined`, does nothing.
 */
const attach = (subagent: Subagent | undefined): void => {
  if (subagent === undefined) return;
  subagent.isAttached = true;
  subagent.attached.resolve();
};

/**
 * Removes the subagent `sessionId` from `subagents`, and returns `true`. If `subagents` holds no such subagent, returns
 * `false` instead.
 */
const stop = (subagents: Map<string, Subagent>, sessionId: string): boolean => {
  const subagent = subagents.get(sessionId);
  if (subagent === undefined) return false;
  subagents.delete(sessionId);
  subagent.attached.reject(new Error(`The subagent ${sessionId} was stopped`));
  return true;
};

/**
 * Returns the attached subagents of `subagents`.
 */
const list = (subagents: Map<string, Subagent>): readonly AttachedSubagent[] => {
  return [...subagents]
    .filter(([, subagent]) => subagent.isAttached)
    .map(([sessionId, { parentId }]) => ({ sessionId, parentId }));
};
