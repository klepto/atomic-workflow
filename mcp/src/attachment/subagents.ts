import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { mapCreateSubagents } from './subagents.map.ts';

/**
 * Command that a subagent receives when it waits for one. `command` carries a message to carry out, `idle` means that
 * no message came in time, and `stop` means that the subagent is stopped and ends.
 */
export type SubagentCommand =
  | { readonly status: 'command'; readonly content: string }
  | { readonly status: 'idle' }
  | { readonly status: 'stop' };

/**
 * Subagent that has attached and waits for commands.
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
 * Subagents that run inside the attached orchestrator sessions, each with an inbox of the messages that it has not
 * received yet. A subagent attaches the first time that it waits for a command.
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
   * Attaches the subagent `sessionId`, and returns the oldest message of its inbox as a command. With an empty inbox,
   * waits for the next message, and returns an `idle` command when `signal` aborts first. A subagent that waits a
   * second time stops the first wait with an `idle` command. A subagent that is not started, or that is stopped, gets
   * a `stop` command.
   */
  awaitCommand(sessionId: string, signal: AbortSignal): Promise<SubagentCommand>;

  /**
   * Puts the message `content` into the inbox of the subagent `sessionId`, and returns `true`. If no such subagent is
   * started, returns `false` instead.
   */
  deliver(sessionId: string, content: string): boolean;

  /**
   * Stops the subagent `sessionId`, which gets a `stop` command when it waits, and returns `true`. If no such subagent
   * is started, returns `false` instead.
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
