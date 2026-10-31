import type { LoggedMessage } from '@/api/types.ts';
import { parseBash } from '@/conversation/bash-text.ts';
import { isTaskNotification } from '@/conversation/task-notification.ts';
import { withoutWorkflowQuotes } from '@/conversation/workflow-quote.ts';

/**
 * Returns whether the message `message` is a shell command of the bash mode that the user ran, without its output.
 */
const isBashCommand = (message: LoggedMessage): boolean => {
  const bash = message.sender === 'user' ? parseBash(message.content) : undefined;
  return bash?.command !== undefined && bash.output === undefined;
};

/**
 * Returns whether the message `message` is the output of a shell command of the bash mode, without the command.
 */
const isBashOutput = (message: LoggedMessage): boolean => {
  const bash = message.sender === 'user' ? parseBash(message.content) : undefined;
  return bash !== undefined && bash.command === undefined && bash.output !== undefined;
};

/**
 * Returns whether the message `output` is the output of the shell command `command` of the bash mode: an output that
 * follows a command without output in the same session.
 */
const isOutputOf = (command: LoggedMessage, output: LoggedMessage): boolean =>
  command.sessionId === output.sessionId && isBashCommand(command) && isBashOutput(output);

/**
 * Returns the messages `messages` with each shell command of the bash mode merged with its output into one message,
 * when the output follows the command in the same session. The merged message is the message of the command, with the
 * text of the output after its own.
 */
const mergeBashOutputs = (messages: readonly LoggedMessage[]): readonly LoggedMessage[] =>
  messages.reduce<LoggedMessage[]>((merged, message) => {
    const previous = merged.at(-1);
    if (previous !== undefined && isOutputOf(previous, message)) {
      merged[merged.length - 1] = { ...previous, content: `${previous.content}${message.content}` };
    } else {
      merged.push(message);
    }
    return merged;
  }, []);

/**
 * Returns the messages of `logged` that the log shows: none that notifies that a background task ended, and each
 * without the marked quotes of the atomic-workflow server at its start and at its end, such as the messages that an
 * agent quotes before its reply, or the word that ends the turn of a subagent after its reply. A message that holds
 * only marked quotes is not shown. A shell command of the bash mode and its output that follows it in the same
 * session show as one message, the message of the command.
 */
export const visibleMessages = (logged: readonly LoggedMessage[]): readonly LoggedMessage[] =>
  mergeBashOutputs(
    logged
      .filter((message) => !isTaskNotification(message.content))
      .map((message) => ({ ...message, content: withoutWorkflowQuotes(message.content) }))
      .filter((message) => message.content.trim() !== ''),
  );

/**
 * Returns the ids of the messages of `entries` that belong to another session than the message before them.
 */
export const sessionBreaks = (entries: readonly LoggedMessage[]): ReadonlySet<number> =>
  new Set(
    entries
      .filter((message, index) => index > 0 && message.sessionId !== entries[index - 1]?.sessionId)
      .map((message) => message.id),
  );
