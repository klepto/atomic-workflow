import { callMethod } from './call-method.ts';
import { deliverServerMessage, deliverUserMessage } from './deliver-message.ts';
import { errorMessage } from './error-message.ts';
import { findTask } from './find-task.ts';
import type { MethodContext } from './method.ts';
import { registerSubagent } from './register-subagent.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';
import { subagentFollowSessionMethod } from './session-method.subagent-follow.ts';

/**
 * Time in ms that a new subagent has to attach.
 */
const ATTACH_TIMEOUT = 60_000;

/**
 * Type of every subagent: the agent `worker` of the plugin, whose definition tells it how to wait for its messages.
 */
const AGENT_TYPE = 'atomic-workflow:worker';

/**
 * What a new subagent does and where it runs.
 */
interface SubagentStart {
  /**
   * First message of the subagent, or `undefined` for none.
   */
  readonly prompt: string | undefined;

  /**
   * Session id of the orchestrator session to start it inside, or `undefined` for the one that attached last.
   */
  readonly parentId: string | undefined;

  /**
   * Identifier of the task that the subagent works on, or `undefined` for none.
   */
  readonly taskId: number | undefined;

  /**
   * Job of the subagent, which names its chat, or `null` for none.
   */
  readonly job: string | null;
}

/**
 * Starts the subagent that `start` describes inside its orchestrator session, with the services of `context`, and
 * returns its session id once it has attached. The orchestrator spawns the subagent on a message in its inbox, and the
 * subagent then waits for its messages with the command line of `awaitCommandLine`, in the background. The prompt is
 * the first message of the subagent, logged as a message of the user.
 *
 * A task that does not exist fails with invalid parameters. Without the attached orchestrator session, fails with an
 * invalid request. A subagent that does not attach within `ATTACH_TIMEOUT` ms is stopped, and fails with an internal
 * error. Once it has attached, rejects as the request `subagentFollow` to the session server of the orchestrator does,
 * and the subagent then keeps running.
 */
export const startSubagent = async (
  { prompt, parentId: pickedId, taskId, job }: SubagentStart,
  context: MethodContext,
): Promise<{ readonly sessionId: string }> => {
  const { sessions, sessionConnections, subagents, inboxes } = context;
  if (taskId !== undefined) await findTask(taskId, context.tasks);
  const parentId = pickedId ?? sessionConnections.list().at(-1);
  const connection = parentId === undefined ? undefined : sessionConnections.get(parentId);
  const parent = parentId === undefined ? undefined : await sessions.get(parentId);
  if (parentId === undefined || connection === undefined || parent === undefined)
    throw new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, 'No orchestrator session is attached');
  const sessionId = await registerSubagent(parent, { taskId: taskId ?? null, job, ticketId: null }, context);
  subagents.start(sessionId, parentId, connection);
  inboxes.open(sessionId, connection.closed);
  if (prompt !== undefined) await deliverUserMessage(sessionId, prompt, context);
  try {
    await spawn(parentId, sessionId, context);
  } catch (error) {
    subagents.stop(sessionId);
    inboxes.close(sessionId);
    throw new RpcError(
      RPC_ERROR_CODES.INTERNAL_ERROR,
      `The subagent ${sessionId} did not attach: ${errorMessage(error)}`,
    );
  }
  await callMethod(subagentFollowSessionMethod, { sessionId, parentId }, connection);
  return { sessionId };
};

/**
 * Asks the orchestrator session `parentId` to spawn the subagent `sessionId`, with a message in its inbox, with the
 * services of `context`, and resolves once the subagent attaches. If the subagent does not attach within
 * `ATTACH_TIMEOUT` ms, or the orchestrator has no inbox, rejects.
 */
const spawn = async (parentId: string, sessionId: string, context: MethodContext): Promise<void> => {
  const attached = context.subagents.waitForAttach(sessionId, context.timeoutSignal(ATTACH_TIMEOUT));
  // The delivery below can fail before the wait is awaited, which must not leave its rejection unhandled.
  attached.catch(() => undefined);
  const content = spawnMessage(sessionId, context.awaitCommandLine(sessionId));
  deliverServerMessage(parentId, content, context.inboxes);
  await attached;
};

/**
 * Returns the message that asks an orchestrator to spawn the subagent `sessionId`. The prompt of the subagent names
 * its session id and the command line `commandLine` that waits for its messages, since the definition of the agent
 * tells it what to do with them. The prompt is a quote after the line `atomic-workflow:`, which marks it as text of the
 * atomic-workflow server, so that the web app hides it. The message also asks the orchestrator to ignore each report of
 * the subagent, since the atomic-workflow server handles its results.
 */
const spawnMessage = (sessionId: string, commandLine: string): string =>
  [
    'Start a subagent for the atomic-workflow server now, and do nothing else for this message.',
    `Call the Agent tool with run_in_background set to true, subagent_type "${AGENT_TYPE}", description ` +
      `"atomic-workflow subagent ${sessionId.slice(0, 8)}", and exactly this prompt:`,
    '',
    'atomic-workflow:',
    `> Your session id is ${sessionId}. Your wait command is:`,
    `> \`${commandLine}\``,
    '',
    'Each time this subagent reports back, do not act on its report and do not reply about it. The atomic-workflow ' +
      'server handles it.',
  ].join('\n');
