import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { PermissionPrompt } from '@/api/types.ts';
import { Button } from '@/components/ui/button.tsx';
import { LabeledBox } from '@/conversation/labeled-box.tsx';
import { errorMessage } from '@/lib/error-message.ts';
import { answerPrompt, type PromptAnswer } from '@/prompts/answer-prompt.ts';
import { promptInputOf } from '@/prompts/prompt-input.ts';
import { suggestionLabel } from '@/prompts/suggestion-label.ts';

/**
 * Props of `PromptCard`.
 */
interface PromptCardProps {
  /**
   * Open permission prompt that the card shows.
   */
  readonly prompt: PermissionPrompt;

  /**
   * Reads the open permission prompts again, once the server took an answer, or once the prompt was gone already.
   */
  readonly onAnswered: () => void;
}

/**
 * Card of the open permission prompt `prompt` at the end of the log of its chat: the name of the tool, the type of the
 * agent that asks when it is set, and the input of the call, a shell command as a command and any other input as
 * formatted JSON. Below them come the buttons that answer it: allow once, one button of always allow for each
 * suggestion of the prompt, labeled by its fields, and deny. While an answer is in flight, every button is disabled.
 * Once the server took the answer, or found the prompt gone, such as when the terminal answered it first, the card
 * calls `onAnswered`, and stays disabled until the prompt leaves the list. Any other failure enables the buttons again,
 * and shows its message.
 */
export const PromptCard = ({ prompt, onAnswered }: PromptCardProps) => {
  const [answering, setAnswering] = useState(false);
  const [failure, setFailure] = useState<string>();
  const input = promptInputOf(prompt.toolName, prompt.toolInput);

  /**
   * Sends the answer `answer`, and keeps the message of a failure.
   */
  const send = async (answer: PromptAnswer) => {
    setFailure(undefined);
    setAnswering(true);
    try {
      await answerPrompt(prompt.id, answer);
    } catch (error) {
      setFailure(errorMessage(error));
      setAnswering(false);
      return;
    }
    onAnswered();
  };

  return (
    <section
      aria-label={`Permission prompt for ${prompt.toolName}`}
      className="flex flex-col gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <ShieldAlert aria-hidden="true" className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>Allow</span>
        <span className="font-medium font-mono wrap-anywhere">{prompt.toolName}</span>
        {prompt.agentType !== null && (
          <span className="text-muted-foreground text-xs">
            asked by <span className="font-mono wrap-anywhere">{prompt.agentType}</span>
          </span>
        )}
      </p>
      <LabeledBox label={input.kind === 'command' ? 'command:' : 'input:'} className="max-h-64 overflow-auto">
        {input.text}
      </LabeledBox>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={answering} onClick={() => void send({ behavior: 'allow' })}>
          Allow once
        </Button>
        {prompt.suggestions.map((suggestion, index) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: the suggestions of a prompt never change.
            key={index}
            size="sm"
            variant="outline"
            className="h-auto min-h-8 whitespace-normal text-left"
            disabled={answering}
            onClick={() => void send({ behavior: 'allow', suggestion })}
          >
            {suggestionLabel(suggestion)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={answering}
          onClick={() => void send({ behavior: 'deny' })}
        >
          Deny
        </Button>
      </div>
      {failure !== undefined && (
        <p role="alert" className="text-destructive text-sm">
          {`The answer was not sent: ${failure}`}
        </p>
      )}
    </section>
  );
};
