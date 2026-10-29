import { LoaderCircle, Plus, Square, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { CHAT_STATUSES, ChatDot } from '@/chats/chat-dot.tsx';
import { type Chat, listChats } from '@/chats/chat-list.ts';
import { DeleteDialog } from '@/components/delete-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import { chatRefOf, routePath, taskRefOf } from '@/routing/route.ts';
import { RouteLink } from '@/routing/route-link.tsx';

/**
 * Props of the sidebar: the sessions, the open chat, the open task, and what opens the chat of a new subagent and reads
 * the sessions again.
 */
export interface SidebarProps {
  /**
   * The sessions of the repository, attached or not, as `sessionList` lists them.
   */
  sessions: readonly ListedSession[];

  /**
   * The open chat, or `undefined` while no chat is open.
   */
  open: Chat | undefined;

  /**
   * The open task, whose chats the sidebar lists, or `undefined` while no task is open.
   */
  task: TaskSummary | undefined;

  /**
   * Opens the chat of the subagent with the session id `sessionId`, which just started.
   */
  onOpen: (sessionId: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readSessions: () => Promise<void>;
}

/**
 * The classes of the link of every entry of the sidebar.
 */
const ENTRY_LINK =
  'flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground';

/**
 * The classes of the button at the right end of the entry of a chat, which shows only while the pointer is over the
 * entry, or while it has the focus.
 */
const ENTRY_ACTION =
  'absolute top-1/2 right-1 size-6 -translate-y-1/2 text-destructive opacity-0 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100';

/**
 * The button that deletes the subagent of the chat `chat` with `sessionDelete`, with its chat, after it asks in a
 * dialog. It sits at the right end of the entry of the chat, and shows only while the pointer is over the entry, while
 * it has the focus, or while its dialog is open.
 */
const DeleteAgent = ({ chat }: { chat: Chat }) => (
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
      await call('sessionDelete', { sessionId: chat.key });
    }}
  >
    <Trash2 aria-hidden="true" className="size-3.5" />
  </DeleteDialog>
);

/**
 * The button that stops the subagent of the chat `chat` at once with `subagentStop`, even in the middle of a turn. It
 * sits at the right end of the entry of the chat, and shows only while the pointer is over the entry, or while it has
 * the focus. Once clicked, it shows a spinner and stays disabled until the subagent ends and the button goes away. A
 * failure enables it again, keeps it shown, and shows its message as the note of the hint of the button.
 */
const StopAgent = ({ chat }: { chat: Chat }) => {
  const [stopping, setStopping] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * Stops the subagent, and keeps the message of a failure.
   */
  const stop = async () => {
    setFailure(undefined);
    setStopping(true);
    try {
      await call('subagentStop', { sessionId: chat.key });
    } catch (error) {
      setFailure(messageOf(error));
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
 * The entry of the chat `chat`: the dot of its status and its label. A screen reader hears the label, then the words
 * of the status. It is a link to `to`, and is marked as the current page when `current` is true. The entry of a subagent
 * that runs has the button that stops it, and the entry of a subagent that ended has the button that deletes it.
 */
const ChatEntry = ({ chat, current, to }: { chat: Chat; current: boolean; to: string }) => {
  const subagent = chat.role === 'subagent';
  const deletable = subagent && chat.status === 'ended';
  const stoppable = subagent && chat.status !== 'ended';
  return (
    <li className="group relative flex min-w-0 max-w-48 md:max-w-none">
      <RouteLink
        to={to}
        aria-current={current ? 'page' : undefined}
        className={cn(ENTRY_LINK, 'cursor-pointer', (deletable || stoppable) && 'pr-8')}
      >
        <ChatDot status={chat.status} />
        <span className="truncate md:flex-1 md:contain-inline-size">{chat.label}</span>
        <span className="sr-only">{`, ${CHAT_STATUSES[chat.status].words}`}</span>
      </RouteLink>
      {deletable && <DeleteAgent chat={chat} />}
      {stoppable && <StopAgent chat={chat} />}
    </li>
  );
};

/**
 * A section of the sidebar: its heading `title`, a line below the heading on a wide screen or after it in the row on a
 * narrow one, then its entries `children`.
 */
const SidebarSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex shrink-0 items-center gap-2 md:flex-col md:items-stretch md:gap-0">
    <h2 className="shrink-0 truncate px-1 font-semibold text-sidebar-foreground text-xs leading-5 md:px-3">{title}</h2>
    <div aria-hidden="true" className="h-5 w-px shrink-0 bg-sidebar-border md:mt-1.5 md:mb-2 md:h-px md:w-auto" />
    {children}
  </section>
);

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The button "Start new agent". A click starts a subagent with `subagentStart` inside the orchestrator session that
 * attached last, which works on the task `taskId`, or on no task while `taskId` is `undefined`. Until the subagent
 * attaches, the button is disabled and shows `Starting…`. Then it reads the sessions
 * again with `readSessions`, and opens the chat of the new subagent with `onOpen`. A failure shows its message below
 * the button and as the note of its hint until the next click. The button is disabled while `ready` is false, and its
 * hint then says why.
 */
const StartAgentButton = ({
  ready,
  taskId,
  onOpen,
  readSessions,
}: {
  ready: boolean;
  taskId: number | undefined;
  onOpen: (sessionId: string) => void;
  readSessions: () => Promise<void>;
}) => {
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * Starts the subagent, then reads the sessions again and opens its chat.
   */
  const start = async () => {
    setFailure(undefined);
    setStarting(true);
    try {
      const { sessionId } = await call<{ sessionId: string }>('subagentStart', taskId === undefined ? {} : { taskId });
      await readSessions();
      onOpen(sessionId);
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col justify-center gap-1">
      <Hint
        description={taskId === undefined ? 'Start a new agent on no task' : `Start a new agent on task ${taskId}`}
        note={failure ?? (ready ? (starting ? 'The agent is starting' : undefined) : 'No main session is attached')}
      >
        <Button variant="outline" size="sm" className="md:w-full" disabled={!ready || starting} onClick={start}>
          {starting ? (
            <>
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Plus aria-hidden="true" />
              Start new agent
            </>
          )}
        </Button>
      </Hint>
      {failure !== undefined && (
        <p role="alert" className="text-destructive text-xs">
          {failure}
        </p>
      )}
    </div>
  );
};

/**
 * The sidebar of the app: the button "Start new agent" at the top, then the section Chats, with its heading above a
 * line. The section lists every chat of the repository: the chat `main session` first, which holds every
 * orchestrator session, then every subagent by its last activity, the latest first. While a task is open, the section
 * lists only the subagents that work on it, after the chat `main session` and the orchestrator of the task, its
 * heading names the task, and a new agent works on the task. A task without subagents says so below the chat
 * `main session`. The dot of each chat shows its status: a grey ring once ended, green while idle, yellow while
 * working, and red while it waits for the user. Each chat is a link to itself beside the open task, and the open chat is marked
 * as the current page. A
 * subagent that runs can be stopped from its entry, and one that ended can be deleted with its chat from it. A
 * new agent starts inside the orchestrator session that attached last. It is the navigation of a column at the left of
 * the page on a wide screen, and of a row above the page on a narrow one.
 */
export const Sidebar = ({ sessions, open, task, onOpen, readSessions }: SidebarProps) => {
  const chats = listChats(sessions, task?.id);
  return (
    <nav aria-label="Chats" className="flex items-stretch gap-4 px-4 py-2 md:flex-col md:gap-6 md:px-3 md:py-4">
      <StartAgentButton
        ready={sessions.some((session) => session.role === 'orchestrator' && session.attached)}
        taskId={task?.id}
        onOpen={onOpen}
        readSessions={readSessions}
      />
      <SidebarSection title={task === undefined ? 'Chats' : `Chats of ${task.slug}`}>
        <ul aria-label="Chats" className="flex gap-1 md:flex-col md:gap-0.5">
          {chats.map((chat) => (
            <ChatEntry
              key={chat.key}
              chat={chat}
              current={chat.key === open?.key}
              to={routePath(task && taskRefOf(task), chatRefOf(chat))}
            />
          ))}
          {task !== undefined && chats.every((chat) => chat.role !== 'subagent') && (
            <li className="flex items-center whitespace-nowrap px-3 py-1.5 text-muted-foreground text-xs">
              No agents on this task yet
            </li>
          )}
        </ul>
      </SidebarSection>
    </nav>
  );
};
