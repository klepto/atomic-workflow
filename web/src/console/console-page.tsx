import { ArrowDown } from 'lucide-react';
import { Fragment, type ReactNode, useMemo } from 'react';
import type { PermissionPrompt } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { useSkills } from '@/commands/use-skills.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { chatWords } from '@/console/chat-words.ts';
import { ConsoleComposer } from '@/console/console-composer.tsx';
import { EmptyChat, EndedNotice } from '@/console/console-notices.tsx';
import { ConsoleRow, PendingRow, SessionBreak } from '@/console/console-rows.tsx';
import { SessionBar } from '@/console/session-bar.tsx';
import { ThinkingRow } from '@/console/thinking-row.tsx';
import { useChatLog } from '@/console/use-chat-log.ts';
import { useFollowScroll } from '@/console/use-follow-scroll.ts';
import { usePendingSends } from '@/console/use-pending-sends.ts';
import { sessionBreaks, visibleMessages } from '@/console/visible-messages.ts';
import { PromptCard } from '@/prompts/prompt-card.tsx';

/**
 * Props of `ConsolePage`.
 */
interface ConsolePageProps {
  /**
   * Open chat, whose messages the console shows and to whose attached session it sends.
   */
  readonly chat: Chat;

  /**
   * Counter of the changes of the message log. The console reads the chat again each time it changes.
   */
  readonly messages: number;

  /**
   * Whether the stream of the page is connected.
   */
  readonly online: boolean;

  /**
   * Open permission prompts of the sessions of the chat, oldest first.
   */
  readonly prompts: readonly PermissionPrompt[];

  /**
   * Reads the open permission prompts again, such as once the user answered one.
   */
  readonly onPromptAnswered: () => void;

  /**
   * Opens the chat with the key `key`, such as the chat of a subagent that a skill started.
   */
  readonly onOpen: (key: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readonly readSessions: () => Promise<void>;
}

/**
 * Returns where a skill that the chat `chat` sends runs: a subagent for the main session, the one that the chat of its
 * job and target holds while it is attached, else a new one, and the subagent itself for a subagent.
 */
const runsInOf = (chat: Chat): ReactNode =>
  chat.role === 'subagent' ? (
    <span className="font-mono text-foreground wrap-anywhere">{chat.label}</span>
  ) : (
    <span className="text-foreground">a subagent</span>
  );

/**
 * Console of the chat `chat`: its messages in a scrolling log, oldest at the top, and the composer at the bottom. The
 * log reads the chat again each time `messages` changes, as `useChatLog` says, and shows the messages that
 * `visibleMessages` keeps, with a line `New session` where they pass from one session to the next. A text of the
 * composer goes out as `usePendingSends` says, and shows at the end of the log until it is sent, or with why it was
 * not. While the session of the chat works, a row at the end of the log says so, with the time of its turn and its
 * newest tool call. The log follows new messages and that row while it is scrolled to its end, and offers a jump to the
 * latest message once the user scrolled up. While the chat has no attached session, a line in place of the composer
 * says why. Above the composer, or that line, `SessionBar` shows the current session of the chat. Each open
 * permission prompt of `prompts` shows at the end of the log, oldest first, with the buttons that answer it.
 */
export const ConsolePage = ({
  chat,
  messages,
  online,
  prompts,
  onPromptAnswered,
  onOpen,
  readSessions,
}: ConsolePageProps) => {
  const { entries: logged, loaded, failure } = useChatLog(chat.logQuery, messages);
  const entries = useMemo(() => visibleMessages(logged), [logged]);
  const breaks = useMemo(() => sessionBreaks(entries), [entries]);
  const skills = useSkills(chat.sessionId);
  const { pending, send, discard } = usePendingSends(chat, skills.skills, { onOpen, readSessions });
  const working = chat.status === 'working';
  const content = useMemo(
    () => [entries, pending, working, chat.latestAction, prompts],
    [entries, pending, working, chat.latestAction, prompts],
  );
  const { box, following, handleScroll, jumpToEnd } = useFollowScroll(content);
  const { sessionId } = chat;
  const empty = entries.length === 0 && pending.length === 0 && prompts.length === 0;

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
            {prompts.map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} onAnswered={onPromptAnswered} />
            ))}
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
            onSend={(text) => void send(sessionId, text)}
          />
        )}
      </div>
    </div>
  );
};
