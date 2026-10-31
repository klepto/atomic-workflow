import type { ReactNode } from 'react';
import type { ListedSession, TaskSummary, UsageLimits } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { ChatEntry } from '@/layout/chat-entry.tsx';
import { StartAgentButton } from '@/layout/start-agent-button.tsx';
import { UsageMeter } from '@/layout/usage-meter.tsx';
import { routePath, taskRefOf } from '@/routing/route.ts';

/**
 * Props of `SidebarSection`.
 */
interface SidebarSectionProps {
  /**
   * Heading of the section.
   */
  readonly title: string;

  /**
   * Entries of the section.
   */
  readonly children: ReactNode;
}

/**
 * Props of `Sidebar`.
 */
interface SidebarProps {
  /**
   * Sessions of the repository, attached or not, as `sessionList` lists them.
   */
  readonly sessions: readonly ListedSession[];

  /**
   * Chats that the sidebar lists: the chats of the open task, or of the repository while no task is open.
   */
  readonly chats: readonly Chat[];

  /**
   * Open chat, or `undefined` while no chat is open.
   */
  readonly open: Chat | undefined;

  /**
   * Open task, or `undefined` while no task is open.
   */
  readonly task: TaskSummary | undefined;

  /**
   * Usage limits of the Claude subscription, as the latest `usageGet` answered them, or `undefined` until it answered,
   * and while it fails.
   */
  readonly usage: UsageLimits | undefined;

  /**
   * Opens the chat of the subagent with the session id `sessionId`, which just started.
   */
  readonly onOpen: (sessionId: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readonly readSessions: () => Promise<void>;
}

/**
 * Section of the sidebar: its heading `title`, a line below the heading on a wide screen or after it in the row on a
 * narrow one, then its entries `children`. The section fills the rest of the sidebar, and its entries scroll inside it
 * while the heading and the line stay in view.
 */
const SidebarSection = ({ title, children }: SidebarSectionProps) => (
  <section className="flex min-h-0 min-w-0 flex-1 items-center gap-2 md:flex-col md:items-stretch md:gap-0">
    <h2 className="shrink-0 truncate px-1 font-semibold text-sidebar-foreground text-xs leading-5 md:px-3">{title}</h2>
    <div aria-hidden="true" className="h-5 w-px shrink-0 bg-sidebar-border md:mt-1.5 md:mb-2 md:h-px md:w-auto" />
    {/* The margin and the padding of the list cancel out, so the focus ring of an entry is not cut at the edge. */}
    <ScrollArea className="-m-1 flex-1">{children}</ScrollArea>
  </section>
);

/**
 * Sidebar of the app: the button `Start new agent` at the top, then the section Chats, with its heading above a line.
 * The section lists the chats `chats`: every chat of the repository, the chat `main session` first, which holds every
 * orchestrator session, then every subagent by its last activity, the latest first. While the task `task` is open, the
 * section lists only the subagents that work on it, after the chat `main session` and the orchestrator of the task,
 * its heading names the task, and a new agent works on the task. A task without subagents says so below the chat
 * `main session`. The dot of each chat shows its status: a grey ring once ended, green while idle, yellow while
 * working, and red while it waits for the user. Each chat is a link to itself beside the open task, and the open chat
 * `open` is marked as the current page. A subagent that runs can be stopped from its entry, and one that ended can be
 * deleted with its chat from it. A new agent starts inside the orchestrator session that attached last, among
 * `sessions`. The meter of the usage limits `usage` comes last: at the bottom of the column on a wide screen, and at
 * the end of the row on a narrow one. The button and the meter stay in place, and the chats scroll inside the section
 * between them. It is the navigation of a column at the left of the page on a wide screen, and of a row above the page
 * on a narrow one.
 */
export const Sidebar = ({ sessions, chats, open, task, usage, onOpen, readSessions }: SidebarProps) => (
  <nav
    aria-label="Chats"
    className="flex min-h-0 items-stretch gap-4 px-4 py-2 md:flex-1 md:flex-col md:gap-6 md:px-3 md:py-4"
  >
    <StartAgentButton
      ready={sessions.some((session) => session.role === 'orchestrator' && session.attached)}
      taskId={task?.id}
      onOpen={onOpen}
      readSessions={readSessions}
    />
    <SidebarSection title={task === undefined ? 'Chats' : `Chats of ${task.slug}`}>
      <ul aria-label="Chats" className="flex gap-1 p-1 md:flex-col md:gap-0.5">
        {chats.map((chat) => (
          <ChatEntry
            key={chat.key}
            chat={chat}
            current={chat.key === open?.key}
            to={routePath(task && taskRefOf(task), chat.ref)}
          />
        ))}
        {task !== undefined && chats.every((chat) => chat.role !== 'subagent') && (
          <li className="flex items-center whitespace-nowrap px-3 py-1.5 text-muted-foreground text-xs">
            No agents on this task yet
          </li>
        )}
      </ul>
    </SidebarSection>
    <UsageMeter usage={usage} />
  </nav>
);
