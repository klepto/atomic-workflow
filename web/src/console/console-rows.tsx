import type { LoggedMessage } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { chatWords } from '@/console/chat-words.ts';
import type { PendingRoute } from '@/console/send-plan.ts';
import type { PendingMessage } from '@/console/use-pending-sends.ts';
import { parseBash } from '@/conversation/bash-text.ts';
import { parseCommand } from '@/conversation/command-text.ts';
import { LabeledBox } from '@/conversation/labeled-box.tsx';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { MessageTime } from '@/conversation/message-time.tsx';
import { cn } from '@/lib/utils.ts';

/**
 * Line below the text of a user row, which says what came of the text.
 */
interface UserLine {
  /**
   * Text of the line.
   */
  readonly text: string;

  /**
   * Whether the line tells of a failure, which shows it in the color of an error.
   */
  readonly failed: boolean;
}

/**
 * Lines of a pending message on one route.
 */
interface PendingLines {
  /**
   * Line while the call of the message runs.
   */
  readonly sending: string;

  /**
   * Line before the message of the failure of the call.
   */
  readonly failed: string;
}

/**
 * Props of `RowFoot`.
 */
interface RowFootProps {
  /**
   * Name of the sender of the text of the row.
   */
  readonly sender: string;

  /**
   * Time when the text was sent, in ms since the epoch, or `undefined` while it has none.
   */
  readonly time: number | undefined;

  /**
   * Whether the name of the sender shows in the monospace font, as the name of a subagent does.
   */
  readonly mono?: boolean;

  /**
   * Classes added to the foot, which win over its own on a conflict.
   */
  readonly className?: string;
}

/**
 * Props of `UserText`.
 */
interface UserTextProps {
  /**
   * Text of the user as typed.
   */
  readonly text: string;
}

/**
 * Props of `UserRow`.
 */
interface UserRowProps {
  /**
   * Accessible name of the row.
   */
  readonly label: string;

  /**
   * Text of the user as typed.
   */
  readonly text: string;

  /**
   * Time when the text was sent, in ms since the epoch, or `undefined` while it has none.
   */
  readonly time: number | undefined;

  /**
   * Line that says what came of the text, or `undefined` for none.
   */
  readonly line?: UserLine;
}

/**
 * Props of `AgentRow`.
 */
interface AgentRowProps {
  /**
   * Message of the agent.
   */
  readonly message: LoggedMessage;

  /**
   * Chat whose log holds the message.
   */
  readonly chat: Chat;
}

/**
 * Props of `ConsoleRow`.
 */
interface ConsoleRowProps {
  /**
   * Message of the row.
   */
  readonly message: LoggedMessage;

  /**
   * Chat whose log holds the message.
   */
  readonly chat: Chat;
}

/**
 * Props of `PendingRow`.
 */
interface PendingRowProps {
  /**
   * Pending message of the row.
   */
  readonly message: PendingMessage;

  /**
   * Discards the message.
   */
  readonly onDiscard: () => void;
}

/**
 * Sender of a text of the user, as the foot of its row names it.
 */
const USER = 'user';

/**
 * Lines of a pending message by its route.
 */
const PENDING_LINES: Readonly<Record<PendingRoute, PendingLines>> = {
  deliver: { sending: 'Sending…', failed: 'Not delivered' },
  subagent: { sending: 'Starting a subagent…', failed: 'No subagent started' },
};

/**
 * Returns the line of the pending message `message`: that it is being sent, or why its call failed.
 */
const pendingLine = (message: PendingMessage): string => {
  const lines = PENDING_LINES[message.route];
  return message.state === 'sending' ? lines.sending : `${lines.failed}: ${message.error}`;
};

/**
 * Foot of a row of the log: the name of the sender of its text, then the time when it was sent, when there is one.
 */
const RowFoot = ({ sender, time, mono, className }: RowFootProps) => (
  <p className={cn('flex items-baseline gap-1.5 text-[0.6875rem] text-muted-foreground leading-4', className)}>
    <span className={cn('font-medium wrap-anywhere', mono && 'font-mono')}>{sender}</span>
    {time !== undefined && <MessageTime time={time} className="text-[0.5625rem]" />}
  </p>
);

/**
 * Text `text` of the user as typed. A text that runs a command shows the name of the command in bold, then its
 * arguments, and none of the tags that Claude Code writes a command into the transcript with. A text of the bash mode
 * shows its shell command in a box labeled `bash command:`, then its output in a box labeled `bash output:`, its
 * standard error in the color of an error, and `No output` for an output with empty streams, without the tags of
 * either.
 */
const UserText = ({ text }: UserTextProps) => {
  const bash = parseBash(text);
  if (bash !== undefined) {
    const { command, output } = bash;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {command !== undefined && <LabeledBox label="bash command:">{command}</LabeledBox>}
        {output !== undefined && (
          <LabeledBox label="bash output:">
            {output.stdout === '' && output.stderr === '' && <span className="text-muted-foreground">No output</span>}
            {output.stdout}
            {output.stdout !== '' && output.stderr !== '' && '\n'}
            {output.stderr !== '' && <span className="text-destructive">{output.stderr}</span>}
          </LabeledBox>
        )}
      </div>
    );
  }
  const command = parseCommand(text);
  return (
    <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-7">
      {command === undefined ? (
        text
      ) : (
        <>
          <span className="font-semibold text-command">{command.name}</span>
          {command.args !== '' && ` ${command.args}`}
        </>
      )}
    </p>
  );
};

/**
 * Text of the user as the log shows it: a bubble on the right side that holds the text as typed and below it the line
 * that says what came of it, when there is one, then below the bubble at the right the foot of the row.
 */
const UserRow = ({ label, text, time, line }: UserRowProps) => (
  <section aria-label={label} className="flex flex-col items-end gap-1">
    <div className="flex max-w-[85%] flex-col gap-1 rounded-2xl rounded-br-md bg-muted px-4 py-2.5">
      <UserText text={text} />
      {line !== undefined && (
        <p role="status" className={cn('text-sm', line.failed ? 'text-destructive' : 'text-muted-foreground')}>
          {line.text}
        </p>
      )}
    </div>
    <RowFoot sender={USER} time={time} />
  </section>
);

/**
 * Message of the agent of the chat `chat`: its text as Markdown, then the foot of the row with the name of the chat
 * and the time when the text was written.
 */
const AgentRow = ({ message, chat }: AgentRowProps) => (
  <section aria-label={`Reply of ${chatWords(chat)}`} className="flex flex-col gap-1">
    <MarkdownBody text={message.content} className="leading-6" />
    <RowFoot sender={chat.label} time={message.timestamp} mono={chat.role === 'subagent'} className="self-start" />
  </section>
);

/**
 * Row of one message `message` of the log of the chat `chat`: a reply of the agent, or a text of the user.
 */
export const ConsoleRow = ({ message, chat }: ConsoleRowProps) =>
  message.sender === 'agent' ? (
    <AgentRow message={message} chat={chat} />
  ) : (
    <UserRow label="Message" text={message.content} time={message.timestamp} />
  );

/**
 * Line between the messages of two sessions of a chat, such as after a `/clear` of the orchestrator.
 */
export const SessionBreak = () => (
  <p className="flex items-center gap-3 text-muted-foreground text-xs">
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
    New session
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
  </p>
);

/**
 * Row of the message `message` of the user that the log does not show yet, with where it stands. A message whose
 * delivery failed offers to discard it, which calls `onDiscard`.
 */
export const PendingRow = ({ message, onDiscard }: PendingRowProps) => (
  <div className="flex flex-col items-end gap-1 opacity-70">
    <UserRow
      label="Pending message"
      text={message.text}
      time={undefined}
      line={{ text: pendingLine(message), failed: message.state === 'failed' }}
    />
    {message.state === 'failed' && (
      <Hint description="Discard the message that was not delivered">
        <Button variant="ghost" size="sm" onClick={onDiscard} className="self-end">
          Discard
        </Button>
      </Hint>
    )}
  </div>
);
