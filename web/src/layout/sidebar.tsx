import { LoaderCircle, Plus } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { ListedSession } from '@/api/types.ts';
import { ChatDot } from '@/chats/chat-dot.tsx';
import { type Chat, type ChatGroup, groupChats } from '@/chats/chat-list.ts';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

/**
 * Props of the sidebar: the attached sessions, the open chat, and what opens a chat and reads the sessions again.
 */
export interface SidebarProps {
  /**
   * The attached sessions, as `sessionList` lists them.
   */
  sessions: readonly ListedSession[];

  /**
   * The open chat, or `undefined` while no chat is open.
   */
  open: Chat | undefined;

  /**
   * Opens the chat of the session `sessionId`.
   */
  onOpen: (sessionId: string) => void;

  /**
   * Reads the attached sessions again. Resolves once a read that started after the call ended.
   */
  readSessions: () => Promise<void>;
}

/**
 * The classes of the button of every entry of the sidebar.
 */
const ENTRY_LINK =
  'flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-muted-foreground text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground';

/**
 * The entry of a chat: its dot and its name `name`. A click on it calls `onOpen`. It is marked as the current page when
 * `current` is true.
 */
const ChatEntry = ({ name, current, onOpen }: { name: string; current: boolean; onOpen: () => void }) => (
  <li className="flex min-w-0">
    <button
      type="button"
      onClick={onOpen}
      aria-current={current ? 'page' : undefined}
      className={cn(ENTRY_LINK, 'cursor-pointer')}
    >
      <ChatDot mark="quiet" />
      <span className="truncate">{name}</span>
    </button>
  </li>
);

/**
 * The classes of the heading of a group of chats.
 */
const GROUP_HEADING = 'shrink-0 truncate px-3 pb-0.5 font-medium text-[0.6875rem] text-muted-foreground leading-4';

/**
 * The group `group` of chats: its heading, then its entries `children` below it on a wide screen, or after it in the row
 * on a narrow one. The heading of a `Session` group shows the short id of its orchestrator session as a muted label,
 * `#1a2b3c4d`, with the full id on hover. The `#` is display text only. A screen reader hears `Session, 1a2b3c4d`.
 */
const ChatGroupEntry = ({ group, children }: { group: ChatGroup; children: ReactNode }) => {
  const heading = useId();
  return (
    <li className="flex min-w-0 items-center gap-1 md:mt-3 md:flex-col md:items-stretch md:gap-0.5 md:first:mt-0">
      <span id={heading} className={GROUP_HEADING}>
        {group.label}
        {group.shortId !== undefined && (
          <span title={group.orchestratorId} className="ml-1 font-normal text-muted-foreground">
            <span aria-hidden="true">{`#${group.shortId}`}</span>
            <span className="sr-only">{`, ${group.shortId}`}</span>
          </span>
        )}
      </span>
      <ul aria-labelledby={heading} className="flex gap-1 md:flex-col">
        {children}
      </ul>
    </li>
  );
};

/**
 * A section of the sidebar: its heading `title`, a line below the heading on a wide screen or after it in the row on a
 * narrow one, then its entries `children`.
 */
const SidebarSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex shrink-0 items-center gap-2 md:flex-col md:items-stretch md:gap-0">
    <h2 className="shrink-0 px-1 font-semibold text-sidebar-foreground text-xs leading-5 md:px-3">{title}</h2>
    <div aria-hidden="true" className="h-5 w-px shrink-0 bg-sidebar-border md:mt-1.5 md:mb-2 md:h-px md:w-auto" />
    {children}
  </section>
);

/**
 * Returns the id of the orchestrator session of the chat `chat` among the groups `groups`: the session itself for an
 * orchestrator, and its parent for a subagent. Returns `undefined` when no chat is open, or when the chat is in the
 * group `Other agents`.
 */
const orchestratorOf = (groups: readonly ChatGroup[], chat: Chat | undefined): string | undefined =>
  chat === undefined
    ? undefined
    : groups.find((group) => group.chats.some((entry) => entry.sessionId === chat.sessionId))?.orchestratorId;

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The button "Start new agent". A click starts a subagent with `subagentStart` inside the orchestrator session
 * `parentId`, or inside the one that attached last when it is `undefined`. Until the subagent attaches, the button is
 * disabled and shows `Starting…`. Then it reads the sessions again with `readSessions`, and opens the chat of the new
 * subagent with `onOpen`. A failure shows its message below the button until the next click. The button is disabled
 * while `ready` is false.
 */
const StartAgentButton = ({
  parentId,
  ready,
  onOpen,
  readSessions,
}: {
  parentId: string | undefined;
  ready: boolean;
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
      const { sessionId } = await call<{ sessionId: string }>(
        'subagentStart',
        parentId === undefined ? {} : { parentId },
      );
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
 * line. The section holds one group for each attached orchestrator session, the one that attached last first, with
 * its chat `orchestrator` and then its subagents in the order of their start. The subagents whose orchestrator is not
 * attached come last, in the group `Other agents`. Each chat has a grey dot, since no agent reports whether it works
 * or waits. A click on a chat opens it, and the open chat is marked as the current page. A new agent starts inside
 * the orchestrator session of the open chat, or inside the one that attached last when no chat is open or the open
 * chat is in `Other agents`. It is the navigation of a column at the left of the page on a wide screen, and of a row
 * above the page on a narrow one.
 */
export const Sidebar = ({ sessions, open, onOpen, readSessions }: SidebarProps) => {
  const groups = groupChats(sessions);
  return (
    <nav aria-label="Chats" className="flex items-stretch gap-4 px-4 py-2 md:flex-col md:gap-6 md:px-3 md:py-4">
      <StartAgentButton
        parentId={orchestratorOf(groups, open)}
        ready={sessions.some((session) => session.role === 'orchestrator')}
        onOpen={onOpen}
        readSessions={readSessions}
      />
      <SidebarSection title="Chats">
        <ul aria-label="Chats" className="flex gap-1 md:flex-col">
          {groups.map((group) => (
            <ChatGroupEntry key={group.key} group={group}>
              {group.chats.map((chat) => (
                <ChatEntry
                  key={chat.sessionId}
                  name={chat.name}
                  current={chat.sessionId === open?.sessionId}
                  onOpen={() => onOpen(chat.sessionId)}
                />
              ))}
            </ChatGroupEntry>
          ))}
        </ul>
      </SidebarSection>
    </nav>
  );
};
