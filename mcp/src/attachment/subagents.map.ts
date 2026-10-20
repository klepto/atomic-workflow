import type { RpcConnection } from '../rpc/rpc-connection.ts';
import type { AttachedSubagent, CreateSubagentsFunction, SubagentCommand } from './subagents.ts';

/**
 * State of one started subagent.
 */
interface Subagent {
  /**
   * Identifier of the orchestrator session that the subagent runs inside.
   */
  readonly parentId: string;

  /**
   * Messages that the subagent has not received yet, the oldest first.
   */
  readonly inbox: string[];

  /**
   * Settles once the subagent attaches, and rejects when it goes away before.
   */
  readonly attached: PromiseWithResolvers<void>;

  /**
   * Whether the subagent has attached.
   */
  isAttached: boolean;

  /**
   * Ends the wait of the subagent for a command with `command`, or `undefined` while the subagent does not wait.
   */
  waiter: ((command: SubagentCommand) => void) | undefined;
}

/**
 * `CreateSubagentsFunction` that keeps the subagents in a map, by session, in the order of their start.
 */
export const mapCreateSubagents: CreateSubagentsFunction = () => {
  const subagents = new Map<string, Subagent>();
  return {
    start: (sessionId, parentId, connection) => start(subagents, sessionId, parentId, connection),
    waitForAttach: (sessionId, signal) => waitForAttach(subagents.get(sessionId), sessionId, signal),
    awaitCommand: (sessionId, signal) => awaitCommand(subagents.get(sessionId), signal),
    deliver: (sessionId, content) => deliver(subagents.get(sessionId), content),
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
  const subagent: Subagent = {
    parentId,
    inbox: [],
    attached: Promise.withResolvers(),
    isAttached: false,
    waiter: undefined,
  };
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
 * Attaches `subagent`, and returns its next command, which waits for a message while its inbox is empty. If `signal`
 * aborts first, returns an `idle` command instead. If `subagent` is `undefined`, returns a `stop` command.
 */
const awaitCommand = (subagent: Subagent | undefined, signal: AbortSignal): Promise<SubagentCommand> => {
  if (subagent === undefined) return Promise.resolve({ status: 'stop' });
  subagent.isAttached = true;
  subagent.attached.resolve();
  const content = subagent.inbox.shift();
  if (content !== undefined) return Promise.resolve({ status: 'command', content });
  subagent.waiter?.({ status: 'idle' });
  return new Promise((resolve) => {
    const finish = (command: SubagentCommand): void => {
      if (subagent.waiter === finish) subagent.waiter = undefined;
      signal.removeEventListener('abort', idle);
      resolve(command);
    };
    const idle = (): void => finish({ status: 'idle' });
    subagent.waiter = finish;
    signal.addEventListener('abort', idle, { once: true });
  });
};

/**
 * Hands the message `content` to `subagent`, to its wait for a command when it waits, and to its inbox otherwise, and
 * returns `true`. If `subagent` is `undefined`, returns `false` instead.
 */
const deliver = (subagent: Subagent | undefined, content: string): boolean => {
  if (subagent === undefined) return false;
  if (subagent.waiter === undefined) subagent.inbox.push(content);
  else subagent.waiter({ status: 'command', content });
  return true;
};

/**
 * Removes the subagent `sessionId` from `subagents`, ends its wait for a command with a `stop` command, and returns
 * `true`. If `subagents` holds no such subagent, returns `false` instead.
 */
const stop = (subagents: Map<string, Subagent>, sessionId: string): boolean => {
  const subagent = subagents.get(sessionId);
  if (subagent === undefined) return false;
  subagents.delete(sessionId);
  subagent.waiter?.({ status: 'stop' });
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
