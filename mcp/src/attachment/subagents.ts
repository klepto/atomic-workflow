import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { mapCreateSubagents } from './subagents.map.ts';

/**
 * Subagent that has attached.
 */
export interface AttachedSubagent {
  /**
   * Identifier of the session of the subagent.
   */
  readonly sessionId: string;

  /**
   * Identifier of the orchestrator session that the subagent runs inside.
   */
  readonly parentId: string;
}

/**
 * Subagents that run inside the attached orchestrator sessions. A subagent attaches the first time that it waits for
 * its messages.
 */
export interface Subagents {
  /**
   * Starts the subagent `sessionId` inside the orchestrator session `parentId`, whose session server serves
   * `connection`. The subagent goes away when it is stopped, or when `connection` closes.
   */
  start(sessionId: string, parentId: string, connection: RpcConnection): void;

  /**
   * Resolves once the subagent `sessionId` attaches. If the subagent is not started, goes away before it attaches, or
   * `signal` aborts first, rejects.
   */
  waitForAttach(sessionId: string, signal: AbortSignal): Promise<void>;

  /**
   * Attaches the subagent `sessionId`. A subagent that is attached already stays attached, and a session that is no
   * started subagent is left as it is.
   */
  attach(sessionId: string): void;

  /**
   * Removes the subagent `sessionId`, and returns `true`. If no such subagent is started, returns `false` instead.
   */
  stop(sessionId: string): boolean;

  /**
   * Returns the attached subagents, in the order in which they were started, the latest last.
   */
  list(): readonly AttachedSubagent[];
}

/**
 * Function that returns new subagents, with no subagent started.
 */
export type CreateSubagentsFunction = () => Subagents;

/**
 * Default `CreateSubagentsFunction`, which keeps the subagents in memory.
 */
export const CreateSubagents: CreateSubagentsFunction = mapCreateSubagents;
