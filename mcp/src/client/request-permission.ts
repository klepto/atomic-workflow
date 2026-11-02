import type { z } from 'zod';
import type { PermissionAnswer } from '../attachment/permission-prompts.ts';
import { callMethod } from '../rpc/call-method.ts';
import { permissionPromptOpenMethod } from '../rpc/method.permission-prompt-open.ts';
import {
  createToolAnswerWatch,
  isAnsweredBy,
  readEarlierLines,
  type ToolCall,
} from '../transcript/claude-tool-answer.ts';
import type { TailFileFunction } from '../transcript/tail-file.ts';
import type { TranscriptFiles } from '../transcript/transcript-files.ts';
import { type AttachClientDependencies, attachRunningClient } from './attach-client.ts';
import type { PermissionRequestInput } from './hook-input.ts';

/**
 * Dependencies of `requestPermission`.
 */
export interface RequestPermissionDependencies extends AttachClientDependencies {
  /**
   * Files of the transcripts, which give the transcript of the asking agent as it is when the hook starts.
   */
  readonly transcriptFiles: TranscriptFiles;

  /**
   * Function that follows the transcript of the asking agent for an answer in the terminal.
   */
  readonly tailFile: TailFileFunction;
}

/**
 * Opens the permission prompt of the input `input` of a `PermissionRequest` hook on the repository server of the
 * repository that holds `directory`, with `dependencies`, and returns the answer of the web app. While it waits, it
 * follows the transcript of the asking agent. Once the transcript shows the tool call answered in the terminal, or an
 * interrupt, it returns `undefined`. Either way it closes its connection, which closes the prompt on the repository
 * server. Outside of a git repository, or without a running repository server, returns `undefined` at once.
 * If the attach, the request or the read of the transcript fails, rejects.
 */
export const requestPermission = async (
  input: PermissionRequestInput,
  directory: string,
  dependencies: RequestPermissionDependencies,
): Promise<PermissionAnswer | undefined> => {
  const attachment = await attachRunningClient(directory, dependencies);
  if (attachment === undefined) return undefined;
  const { connection } = attachment;
  const done = new AbortController();
  try {
    const call: ToolCall = { toolName: input.tool_name, toolInput: input.tool_input };
    const answeredInTerminal = waitForTerminalAnswer(transcriptOf(input), call, done.signal, dependencies);
    const answer = callMethod(permissionPromptOpenMethod, openParams(input), connection, done.signal);
    return await Promise.race([answer, answeredInTerminal.then(() => undefined)]);
  } finally {
    done.abort();
    connection.close();
  }
};

/**
 * Returns the text that a `PermissionRequest` hook prints for the answer `answer`: the decision of the hook as JSON,
 * with `updatedPermissions` only when `answer` has it.
 */
export const permissionDecisionOutput = (answer: PermissionAnswer): string =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision:
        answer.behavior === 'allow'
          ? { behavior: 'allow', updatedPermissions: answer.updatedPermissions }
          : { behavior: 'deny', message: answer.message },
    },
  });

/**
 * Returns the parameters of `permissionPromptOpen` for the input `input` of the hook. The fields that the input of the
 * main session leaves out are `null`, or empty for the suggestions.
 */
const openParams = (input: PermissionRequestInput): z.input<typeof permissionPromptOpenMethod.params> => ({
  sessionId: input.session_id,
  agentId: input.agent_id ?? null,
  agentType: input.agent_type ?? null,
  toolName: input.tool_name,
  toolInput: input.tool_input,
  suggestions: input.permission_suggestions ?? [],
});

/**
 * Returns the path of the transcript of the agent that asks in the input `input`: the transcript of its subagent,
 * `<transcript_path without .jsonl>/subagents/agent-<agent_id>.jsonl`, or else the transcript of the session.
 */
const transcriptOf = (input: PermissionRequestInput): string =>
  input.agent_id === undefined
    ? input.transcript_path
    : `${input.transcript_path.replace(/\.jsonl$/, '')}/subagents/agent-${input.agent_id}.jsonl`;

/**
 * Follows the transcript at `path`, with `dependencies`, from the state that it has now, and resolves once the lines
 * appended to it show the tool call `call` answered outside of the hook, or once `signal` aborts.
 * If the transcript cannot be read, rejects.
 */
const waitForTerminalAnswer = async (
  path: string,
  call: ToolCall,
  signal: AbortSignal,
  dependencies: RequestPermissionDependencies,
): Promise<void> => {
  const text = (await dependencies.transcriptFiles.readText(path)) ?? '';
  // Only the complete lines count as read, so the follow reads the line that Claude Code may be writing now.
  const read = text.slice(0, text.lastIndexOf('\n') + 1);
  const watch = createToolAnswerWatch();
  readEarlierLines(read.split('\n'), call, watch);
  const answered = new AbortController();
  const handle = async (lines: readonly string[]): Promise<void> => {
    if (isAnsweredBy(lines, call, watch)) answered.abort();
  };
  const offset = Buffer.byteLength(read, 'utf8');
  await dependencies.tailFile(path, handle, AbortSignal.any([signal, answered.signal]), { offset });
};
