import { ArrowDown } from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { LoggedMessage } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { expandCommand, skillOf } from '@/commands/skill-commands.ts';
import { useSkills } from '@/commands/use-skills.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { parseCommand } from '@/conversation/command-text.ts';
import { MarkdownBody } from '@/conversation/markdown-body.tsx';
import { MessageTime } from '@/conversation/message-time.tsx';
import { isTaskNotification } from '@/conversation/task-notification.ts';
import { withoutWorkflowQuotes } from '@/conversation/workflow-quote.ts';
import { cn } from '@/lib/utils.ts';
import { ConsoleComposer } from './console-composer.tsx';
import { useFollowScroll } from './follow-scroll.ts';
import { SessionBar } from './session-bar.tsx';
import { ThinkingRow } from './thinking-row.tsx';
import { useChatLog } from './use-chat-log.ts';

/**
 * Props of the console.
 */
export interface ConsolePageProps {
  /**
   * The open chat, whose messages the console shows and to whose attached session it sends.
   */
  chat: Chat;

  /**
   * The counter of the changes of the message log. The console reads the chat again each time it changes.
   */
  messages: number;

  /**
   * Whether the stream of the page is connected.
   */
  online: boolean;

  /**
   * Opens the chat with the key `key`, such as the chat of a subagent that a skill started.
   */
  onOpen: (key: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readSessions: () => Promise<void>;
}

/**
 * A message of the user that the log does not show yet: one being delivered, or one whose delivery failed.
 */
interface PendingMessage {
  /**
   * The key of the message, which no other pending message has.
   */
  key: number;

  /**
   * The text of the message as the user typed it.
   */
  text: string;

  /**
   * Where the message goes: `deliver` to the session of the chat with `messageDeliver`, and `subagent` to a new
   * subagent with `subagentStart`, as the first message of the subagent.
   */
  route: 'deliver' | 'subagent';

  /**
   * Where the message stands: `sending` while its call runs, `failed` once it failed.
   */
  state: 'sending' | 'failed';

  /**
   * The message of the failure of a `failed` message.
   */
  error?: string;
}

/**
 * The sender of a text of the user, as the foot of its row names it.
 */
const USER = 'user';

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Returns the time of the message `message` as a UTC ISO-8601 string.
 */
const timeOf = (message: LoggedMessage) => new Date(message.timestamp).toISOString();

/**
 * Returns the words by which the console names the chat `chat`: `the main session`, or the label of a subagent.
 */
const chatWords = (chat: Chat) => (chat.role === 'orchestrator' ? 'the main session' : chat.label);

/**
 * The foot of a row of the log: the name of the sender of its text, then the time it was sent, when there is one.
 * `mono` picks the monospace font for the name of a subagent.
 */
const RowFoot = ({
  sender,
  time,
  mono,
  className,
}: {
  sender: string;
  time: string | undefined;
  mono?: boolean;
  className?: string;
}) => (
  <p className={cn('flex items-baseline gap-1.5 text-[0.6875rem] text-muted-foreground leading-4', className)}>
    <span className={cn('font-medium wrap-anywhere', mono && 'font-mono')}>{sender}</span>
    {time !== undefined && <MessageTime time={time} className="text-[0.5625rem]" />}
  </p>
);

/**
 * The text `text` of the user as typed. A text that runs a command shows the name of the command in bold, then its
 * arguments, and none of the tags that Claude Code writes a command into the transcript with.
 */
const UserText = ({ text }: { text: string }) => {
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
 * A text of the user as the log shows it: a bubble on the right side that holds the text as typed and below it the line
 * that says what came of it, when there is one, then below the bubble at the right the foot of the row.
 */
const UserRow = ({
  label,
  text,
  time,
  line,
}: {
  label: string;
  text: string;
  time: string | undefined;
  line?: { text: string; failed: boolean };
}) => (
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
 * A message of the agent of the chat `chat`: its text as Markdown, then the foot of the row with the name of the chat
 * and the time the text was written.
 */
const AgentRow = ({ message, chat }: { message: LoggedMessage; chat: Chat }) => (
  <section aria-label={`Reply of ${chatWords(chat)}`} className="flex flex-col gap-1">
    <MarkdownBody text={message.content} className="leading-6" />
    <RowFoot sender={chat.label} time={timeOf(message)} mono={chat.role === 'subagent'} className="self-start" />
  </section>
);

/**
 * One message of the log of the chat `chat`.
 */
const ConsoleRow = ({ message, chat }: { message: LoggedMessage; chat: Chat }) =>
  message.sender === 'agent' ? (
    <AgentRow message={message} chat={chat} />
  ) : (
    <UserRow label="Message" text={message.content} time={timeOf(message)} />
  );

/**
 * The line between the messages of two sessions of a chat, such as after a `/clear` of the orchestrator.
 */
const SessionBreak = () => (
  <p className="flex items-center gap-3 text-muted-foreground text-xs">
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
    New session
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
  </p>
);

/**
 * Returns the ids of the messages of `entries` that belong to another session than the message before them.
 */
const sessionBreaks = (entries: readonly LoggedMessage[]): ReadonlySet<number> =>
  new Set(
    entries
      .filter((message, index) => index > 0 && message.sessionId !== entries[index - 1]?.sessionId)
      .map((message) => message.id),
  );

/**
 * The lines of a pending message by its route: the line while its call runs, and the line before the message of its
 * failure.
 */
const PENDING_LINES: Record<PendingMessage['route'], { sending: string; failed: string }> = {
  deliver: { sending: 'Sending…', failed: 'Not delivered' },
  subagent: { sending: 'Starting a subagent…', failed: 'No subagent started' },
};

/**
 * Returns the line of the pending message `message`: that it is being sent, or why its call failed.
 */
const pendingLine = (message: PendingMessage) => {
  const lines = PENDING_LINES[message.route];
  return message.state === 'sending' ? lines.sending : `${lines.failed}: ${message.error}`;
};

/**
 * A message of the user that the log does not show yet, with where it stands. A message whose delivery failed offers
 * to discard it.
 */
const PendingRow = ({ message, onDiscard }: { message: PendingMessage; onDiscard: () => void }) => (
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

/**
 * The empty state of the main column: its heading `title` over the muted line `children`.
 */
const EmptyState = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 py-16 text-center">
    <p className="font-medium text-lg">{title}</p>
    <p className="max-w-md text-muted-foreground text-sm leading-6">{children}</p>
  </div>
);

/**
 * The line that the chat `chat` shows while it has no message: what to ask the main session, or who the subagent is.
 */
const EmptyChat = ({ chat }: { chat: Chat }) =>
  chat.role === 'orchestrator' ? (
    <EmptyState title="What should the main session do?">Your messages and its replies show here.</EmptyState>
  ) : (
    <EmptyState title={<span className="font-mono wrap-anywhere">{chat.label}</span>}>
      Nothing said yet. Your messages and its replies show here.
    </EmptyState>
  );

/**
 * The line that tells how to attach an orchestrator session.
 */
const ATTACH_HINT = 'Run /atomic-workflow in a Claude Code session of this repository.';

/**
 * The main column while no chat is open, since no agent has run in the repository: what attaches one.
 */
export const NoChat = () => (
  <div className="flex min-h-0 flex-1 flex-col">
    <EmptyState title="No agent has run in this repository yet.">{ATTACH_HINT}</EmptyState>
  </div>
);

/**
 * The line in place of the composer while the chat `chat` has no attached session: what attaches the main session, or
 * that the subagent has ended.
 */
const EndedNotice = ({ chat }: { chat: Chat }) => (
  <p role="status" className="rounded-2xl border border-dashed px-4 py-3 text-center text-muted-foreground text-sm">
    {chat.role === 'orchestrator' ? (
      `No main session is attached. ${ATTACH_HINT}`
    ) : (
      <>
        <span className="font-mono wrap-anywhere">{chat.label}</span> has ended. Its messages stay here to read.
      </>
    )}
  </p>
);

/**
 * Returns where a skill that the chat `chat` sends runs: a new subagent for the main session, and the subagent itself
 * for a subagent.
 */
const runsInOf = (chat: Chat): ReactNode =>
  chat.role === 'subagent' ? (
    <span className="font-mono text-foreground wrap-anywhere">{chat.label}</span>
  ) : (
    <span className="text-foreground">a new subagent</span>
  );

/**
 * Returns the messages of `logged` that the log shows: none that notifies that a background task ended, and each
 * without the marked quotes of the atomic-workflow server at its start and at its end, such as the messages that an
 * agent quotes before its reply, or the word that ends the turn of a subagent after its reply. A message that holds only
 * marked quotes is not shown.
 */
const visibleMessages = (logged: readonly LoggedMessage[]): readonly LoggedMessage[] =>
  logged
    .filter((message) => !isTaskNotification(message.content))
    .map((message) => ({ ...message, content: withoutWorkflowQuotes(message.content) }))
    .filter((message) => message.content.trim() !== '');

/**
 * The console, the chat `chat`: its messages in a scrolling log, oldest at the top, and the composer at the bottom. The
 * log is read at load and each time `messages` changes, and shows no notification that a background task ended and no
 * text of the atomic-workflow server. Where the messages of the log pass from one session to the next, such as after a
 * `/clear` of the orchestrator, a line says `New session`. A text of the composer goes to the attached session of the
 * chat with `messageDeliver`, and shows at the end of the log until it is delivered, or with why it was not. A text
 * that runs a skill of the session goes the same way in the chat of a subagent. In the chat of the main session, it
 * starts a new subagent with `subagentStart` instead, with the text as its first message, whether a task is open or
 * not, and once the subagent attaches, the chat of the subagent opens. The subagent works on no task until its skill
 * picks one. While the session of the chat works, a row at the end of the log says so, with the time of its turn and its
 * newest tool call. The log follows new messages and that row while it is scrolled to its end, and offers a jump to
 * the latest message once the user scrolled up. While the chat has no attached session, a line in place of the
 * composer says why. Above the composer, or that line, a line shows how long the current session of the chat has run
 * and the size of its context, counting up while it is attached, and still at its latest message once it ended.
 */
export const ConsolePage = ({ chat, messages, online, onOpen, readSessions }: ConsolePageProps) => {
  const { entries: logged, loaded, failure } = useChatLog(chat.logQuery, messages);
  const entries = useMemo(() => visibleMessages(logged), [logged]);
  const skills = useSkills(chat.sessionId);
  const breaks = useMemo(() => sessionBreaks(entries), [entries]);
  const [pending, setPending] = useState<readonly PendingMessage[]>([]);
  const lastKey = useRef(0);
  const mounted = useRef(true);
  const working = chat.status === 'working';
  const content = useMemo(
    () => [entries, pending, working, chat.latestAction],
    [entries, pending, working, chat.latestAction],
  );
  const { box, following, handleScroll, jumpToEnd } = useFollowScroll(content);

  /**
   * Removes the pending message `key` from the log.
   */
  const discard = (key: number) => setPending((current) => current.filter((message) => message.key !== key));

  /**
   * Marks the pending message `key` as failed, with the message of the failure `error`.
   */
  const fail = (key: number, error: unknown) =>
    setPending((current) =>
      current.map((message) =>
        message.key === key ? { ...message, state: 'failed', error: messageOf(error) } : message,
      ),
    );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Shows the text `text` as pending on the route `route` until `run` settles. A text whose call succeeded leaves the
   * log, and a failed one stays with the message of the failure.
   */
  const track = async (text: string, route: PendingMessage['route'], run: () => Promise<unknown>) => {
    lastKey.current += 1;
    const key = lastKey.current;
    setPending((current) => [...current, { key, text, route, state: 'sending' }]);
    try {
      await run();
      discard(key);
    } catch (error) {
      fail(key, error);
    }
  };

  /**
   * Starts a subagent inside the session `parentId` with the text `text` as its first message, then reads the sessions
   * again and opens the chat of the subagent, unless the console closed meanwhile.
   */
  const startSubagent = async (parentId: string, text: string) => {
    const { sessionId } = await call<{ sessionId: string }>('subagentStart', { prompt: text, parentId });
    await readSessions();
    if (mounted.current) {
      onOpen(sessionId);
    }
  };

  /**
   * Sends the text `text` to the attached session `sessionId` of the chat. A text that runs a skill in the chat of the
   * main session goes to a new subagent inside the session, which works on no task. Every other text goes to the session itself. A text that runs a skill is sent with the whole name of the
   * skill in place of its command.
   */
  const send = (sessionId: string, text: string) => {
    const skill = skillOf(text, skills.skills ?? []);
    if (skill === undefined) {
      return track(text, 'deliver', () => call('messageDeliver', { sessionId, content: text }));
    }
    const expanded = expandCommand(text, skill);
    if (chat.role === 'subagent') {
      return track(expanded, 'deliver', () => call('messageDeliver', { sessionId, content: expanded }));
    }
    return track(expanded, 'subagent', () => startSubagent(sessionId, expanded));
  };

  const { sessionId } = chat;
  const empty = entries.length === 0 && pending.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{`Chat with ${chat.label}`}</h1>
      <ScrollArea
        viewportRef={box}
        onScroll={handleScroll}
        className="flex-1"
        viewportClassName="motion-safe:scroll-smooth"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-10 md:px-6 md:pt-10">
          {failure !== null && (
            <p role="alert" className="text-destructive text-sm">
              {`The chat with ${chat.label} cannot be read: ${failure}`}
            </p>
          )}
          {(loaded || failure !== null) && empty && <EmptyChat chat={chat} />}
          <div role="log" aria-label="Messages" className="flex flex-col gap-5">
            {entries.map((message) => (
              <Fragment key={message.id}>
                {breaks.has(message.id) && <SessionBreak />}
                <ConsoleRow message={message} chat={chat} />
              </Fragment>
            ))}
            {pending.map((message) => (
              <PendingRow key={message.key} message={message} onDiscard={() => discard(message.key)} />
            ))}
            {working && <ThinkingRow since={chat.turnStartedAt} action={chat.latestAction} />}
          </div>
        </div>
      </ScrollArea>
      <div className="relative mx-auto w-full max-w-3xl px-3 pb-3 md:px-6 md:pb-5">
        {!following && (
          <Hint description="Jump to the latest message">
            <Button
              variant="outline"
              size="icon"
              aria-label="Jump to latest"
              onClick={jumpToEnd}
              className="-top-12 -translate-x-1/2 absolute left-1/2 rounded-full bg-background shadow-md"
            >
              <ArrowDown />
            </Button>
          </Hint>
        )}
        <SessionBar
          startedAt={chat.startedAt}
          stoppedAt={sessionId === undefined ? (chat.lastActivityAt ?? chat.startedAt) : null}
          contextTokens={chat.contextTokens}
          model={chat.model}
          effort={chat.effort}
        />
        {sessionId === undefined ? (
          <EndedNotice chat={chat} />
        ) : (
          <ConsoleComposer
            placeholder={`Write to ${chatWords(chat)}`}
            notice={online ? null : 'Server not reachable. A message sent now fails.'}
            skills={skills.skills}
            skillsFailure={skills.failure}
            runsIn={runsInOf(chat)}
            onMenuOpen={skills.refresh}
            onSend={(text) => send(sessionId, text)}
          />
        )}
      </div>
    </div>
  );
};
