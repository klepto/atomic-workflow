import { LoaderCircle, ShieldAlert, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { ChatDot } from '@/chats/chat-dot.tsx';
import type { Chat } from '@/chats/chat-list.ts';
import { CHAT_STATUSES } from '@/chats/chat-statuses.ts';
import { DeleteDialog } from '@/components/delete-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Hint, OverflowHint } from '@/components/ui/hint.tsx';
import { errorMessage } from '@/lib/error-message.ts';
import { cn } from '@/lib/utils.ts';
import { RouteLink } from '@/routing/route-link.tsx';

/**
 * Classes of the link of every entry of the sidebar.
 */
const ENTRY_LINK =
  'flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground';

/**
 * Classes of the button at the right end of the entry of a chat, which shows only while the pointer is over the entry,
 * or while it has the focus.
 */
const ENTRY_ACTION =
  'absolute top-1/2 right-1 size-6 -translate-y-1/2 text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100';

/**
 * Props of `DeleteAgent`.
 */
interface DeleteAgentProps {
  /**
   * Chat of the subagent that the button deletes.
   */
  readonly chat: Chat;
}

/**
 * Props of `StopAgent`.
 */
interface StopAgentProps {
  /**
   * Chat of the subagent that the button stops.
   */
  readonly chat: Chat;
}

/**
 * Props of `ChatEntry`.
 */
interface ChatEntryProps {
  /**
   * Chat that the entry shows.
   */
  readonly chat: Chat;

  /**
   * Whether the chat is the open one, which the entry marks as the current page.
   */
  readonly current: boolean;

  /**
   * Path that the entry links to.
   */
  readonly to: string;

  /**
   * Whether a session of the chat has an open permission prompt.
   */
  readonly prompting: boolean;
}

/**
 * Button that deletes every subagent of the chat `chat` with `sessionDelete`, one after the other, with the chat, after
 * it asks in a dialog. It sits at the right end of the entry of the chat, and shows only while the pointer is over the
 * entry, while it has the focus, or while its dialog is open.
 */
const DeleteAgent = ({ chat }: DeleteAgentProps) => (
  <DeleteDialog
    trigger={
      <Button
        variant="ghost"
        size="icon"
        className={cn(ENTRY_ACTION, 'data-popup-open:opacity-100')}
        aria-label={`Delete ${chat.label}`}
      />
    }
    hint="Delete the subagent with its chat"
    title={`Delete ${chat.label}?`}
    description="This deletes the agent with its chat. You cannot undo it."
    confirm="Delete agent"
    onDelete={async () => {
      for (const sessionId of chat.sessionIds) {
        await fetchCall('sessionDelete', { sessionId });
      }
    }}
  >
    <Trash2 aria-hidden="true" className="size-3.5" />
  </DeleteDialog>
);

/**
 * Button that stops the attached subagent of the chat `chat` at once with `subagentStop`, even in the middle of a turn,
 * while the chat has one. It sits at the right end of the entry of the chat, and shows only while the pointer is over
 * the entry, or while it has the focus. Once clicked, it shows a spinner and stays disabled until the subagent ends and the button goes away. A
 * failure enables it again, keeps it shown, and shows its message as the note of the hint of the button.
 */
const StopAgent = ({ chat }: StopAgentProps) => {
  const [stopping, setStopping] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * Stops the subagent, and keeps the message of a failure.
   */
  const stop = async () => {
    if (chat.sessionId === undefined) {
      return;
    }
    setFailure(undefined);
    setStopping(true);
    try {
      await fetchCall('subagentStop', { sessionId: chat.sessionId });
    } catch (error) {
      setFailure(errorMessage(error));
      setStopping(false);
    }
  };

  return (
    <Hint description="Stop the subagent at once" note={failure ?? (stopping ? 'The subagent is stopping' : undefined)}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(ENTRY_ACTION, (stopping || failure !== undefined) && 'opacity-100')}
        aria-label={`Stop ${chat.label}`}
        disabled={stopping}
        onClick={stop}
      >
        {stopping ? (
          <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
        ) : (
          <Square aria-hidden="true" className="size-3.5" />
        )}
      </Button>
    </Hint>
  );
};

/**
 * Entry of the chat `chat` in the sidebar: the dot of its status and its label. A screen reader hears the label, then
 * the words of the status. It is a link to `to`, and is marked as the current page when `current` is true. The entry
 * of a subagent that runs has the button that stops it, and the entry of a subagent that ended has the button that
 * deletes it. While the label does not fit the entry, a hover on the entry shows the full label in a hint at once.
 * While `prompting` is true, a shield after the label marks the chat, and a screen reader hears that it asks for
 * permission after the words of the status.
 */
export const ChatEntry = ({ chat, current, to, prompting }: ChatEntryProps) => {
  const label = useRef<HTMLSpanElement>(null);
  const subagent = chat.role === 'subagent';
  const deletable = subagent && chat.status === 'ended';
  const stoppable = subagent && chat.status !== 'ended';
  return (
    <li className="group relative flex min-w-0 max-w-48 md:max-w-none">
      <OverflowHint text={chat.label} target={label}>
        <RouteLink
          to={to}
          aria-current={current ? 'page' : undefined}
          className={cn(ENTRY_LINK, 'cursor-pointer', (deletable || stoppable) && 'pr-8')}
        >
          <ChatDot status={chat.status} />
          <span ref={label} className="truncate md:flex-1 md:contain-inline-size">
            {chat.label}
          </span>
          {prompting && (
            <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span className="sr-only">
            {`, ${CHAT_STATUSES[chat.status].words}${prompting ? ', asks for permission' : ''}`}
          </span>
        </RouteLink>
      </OverflowHint>
      {deletable && <DeleteAgent chat={chat} />}
      {stoppable && <StopAgent chat={chat} />}
    </li>
  );
};
