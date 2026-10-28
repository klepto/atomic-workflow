import { useState } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, listChats } from '@/chats/chat-list.ts';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { ConsolePage, NoChat } from '@/console/console-page.tsx';
import { useConnection } from './api/event-stream.ts';
import { usePageData } from './api/page-data.ts';
import { PageHeader, taskTabIdOf } from './layout/page-header.tsx';
import { Sidebar } from './layout/sidebar.tsx';
import { TaskPanel } from './tasks/task-panel.tsx';
import { ThemePicker } from './theme/theme-picker.tsx';

/**
 * The banner below the header while the stream of the page is down. Messages and new agents fail until the server is
 * back. It stays in view while the page scrolls.
 */
const ConnectionBanner = () => (
  <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
    <AlertDescription className="text-destructive">
      Server not reachable. Messages and new agents fail until it is back.
    </AlertDescription>
  </Alert>
);

/**
 * Returns the open chat among the chats of the sessions `sessions`, or `undefined` while no chat is open, with the
 * function that opens a chat by its key. The open chat lives in state, not in the URL. Once the sessions are known, the
 * first chat of the list opens whenever the open chat is not among them, such as at load. With no chat, no chat is
 * open.
 */
const useOpenChat = (
  sessions: readonly ListedSession[] | undefined,
): [open: Chat | undefined, setOpenKey: (key: string | undefined) => void] => {
  const [openKey, setOpenKey] = useState<string>();
  const chats = sessions === undefined ? undefined : listChats(sessions);
  const open = chats?.find((chat) => chat.key === openKey);
  if (chats !== undefined && open === undefined) {
    const fallback = chats[0]?.key;
    if (fallback !== openKey) {
      setOpenKey(fallback);
    }
  }
  return [open, setOpenKey];
};

/**
 * Returns the open task among the tasks `tasks`, or `undefined` while no task is open, with the function that opens a
 * task by its id or closes it while it is open, the one that closes the open task, and the one that opens a task by its
 * id. The open task lives in state, not in the URL. A task that is no longer among `tasks`, such as one deleted, counts
 * as closed. Closing the open task moves the focus to its tab.
 */
const useOpenTask = (
  tasks: readonly TaskSummary[] | undefined,
): [
  open: TaskSummary | undefined,
  toggle: (taskId: number) => void,
  close: () => void,
  show: (taskId: number) => void,
] => {
  const [openId, setOpenId] = useState<number>();
  const open = tasks?.find((task) => task.id === openId);
  const toggle = (taskId: number) => setOpenId((current) => (current === taskId ? undefined : taskId));
  const close = () => {
    if (openId !== undefined) {
      document.getElementById(taskTabIdOf(openId))?.focus();
    }
    setOpenId(undefined);
  };
  return [open, toggle, close, setOpenId];
};

/**
 * Calls `onFirstTask` with the id of the task of the open chat `open`, among the sessions `sessions`, when the subagent
 * of that chat gets its first task while its chat stays open, such as once it creates the task with its first goal. A
 * chat that already has a task when it opens does not call it.
 */
const useFirstTaskOfOpenChat = (
  open: Chat | undefined,
  sessions: readonly ListedSession[] | undefined,
  onFirstTask: (taskId: number) => void,
) => {
  const taskId =
    open?.role === 'subagent' ? (sessions?.find((session) => session.sessionId === open.key)?.taskId ?? null) : null;
  const [seen, setSeen] = useState({ key: open?.key, taskId });
  if (seen.key !== open?.key || seen.taskId !== taskId) {
    setSeen({ key: open?.key, taskId });
    if (seen.key === open?.key && seen.taskId === null && taskId !== null) {
      onFirstTask(taskId);
    }
  }
};

/**
 * The app: the header, the banner while the stream is down, and below them the sidebar beside the main column, with
 * the panel of the open task at the right. The main column stays empty until the sessions are known. Then it shows the
 * open chat, or the line that no agent has run in the repository while there is no chat. The app fills the window, and
 * the window never scrolls: the sidebar, the tabs of the header, the main column and the task panel each scroll inside
 * themselves. While a task is open, the sidebar lists the chats of the task. The task of the open chat opens once its
 * subagent gets it. On a narrow screen the sidebar is a row above the main column, and the task panel covers both.
 */
const Shell = () => {
  const { online } = useConnection();
  const { repository, sessions, tasks, messages, readSessions } = usePageData();
  const [open, setOpenKey] = useOpenChat(sessions);
  const [openTask, toggleTask, closeTask, showTask] = useOpenTask(tasks);
  useFirstTaskOfOpenChat(open, sessions, showTask);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PageHeader
        repository={repository?.name}
        tasks={tasks ?? []}
        openTaskId={openTask?.id}
        onToggleTask={toggleTask}
      />
      {!online && <ConnectionBanner />}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <ScrollArea className="shrink-0 border-b bg-sidebar text-sidebar-foreground md:w-60 md:border-r md:border-b-0">
          <Sidebar
            sessions={sessions ?? []}
            open={open}
            task={openTask}
            onOpen={setOpenKey}
            readSessions={readSessions}
          />
        </ScrollArea>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {sessions !== undefined &&
            (open === undefined ? (
              <NoChat />
            ) : (
              <ConsolePage
                key={open.key}
                chat={open}
                messages={messages}
                online={online}
                onOpen={setOpenKey}
                readSessions={readSessions}
              />
            ))}
        </main>
        <TaskPanel task={openTask} onClose={closeTask} />
      </div>
    </div>
  );
};

/**
 * The web app of atomic-workflow, with the theme picker at the top right of every page.
 */
export const App = () => (
  <>
    <Shell />
    <div className="absolute top-2 right-4 z-50">
      <ThemePicker />
    </div>
  </>
);
