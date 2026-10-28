import { useEffect, useState } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, listChats } from '@/chats/chat-list.ts';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { ConsolePage, NoChat } from '@/console/console-page.tsx';
import { navigate, useRoute } from '@/routing/navigation.ts';
import { chatRefOf, findChat, findTask, routePath, taskRefOf } from '@/routing/route.ts';
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
 * The view that the URL names: the open task, the chats that the sidebar lists, and the open chat. Each is
 * `undefined` until both the sessions and the tasks are known.
 */
interface View {
  /**
   * The task that the URL names, or `undefined` while it names none that exists.
   */
  openTask: TaskSummary | undefined;

  /**
   * The chats of the open task, or of the repository while no task is open.
   */
  chats: readonly Chat[] | undefined;

  /**
   * The chat that the URL names among `chats`, else the first of them, or `undefined` while there is none.
   */
  open: Chat | undefined;
}

/**
 * Resolves the route of the URL against the sessions `sessions` and the tasks `tasks` into the view that it names, and
 * replaces the URL with the canonical path of that view, with no new history entry, whenever the two differ. Until both
 * the sessions and the tasks are known, nothing resolves and the URL stays as it is.
 */
const useView = (sessions: readonly ListedSession[] | undefined, tasks: readonly TaskSummary[] | undefined): View => {
  const route = useRoute();
  const known = sessions !== undefined && tasks !== undefined;
  const openTask = known && route.taskRef !== undefined ? findTask(tasks, route.taskRef) : undefined;
  const chats = known ? listChats(sessions, openTask?.id) : undefined;
  const named = chats !== undefined && route.chatRef !== undefined ? findChat(chats, route.chatRef) : undefined;
  const open = named ?? chats?.[0];
  const canonical = known ? routePath(openTask && taskRefOf(openTask), open && chatRefOf(open)) : undefined;
  // Runs again on each new route too, since back and forward can lead to a path that is not canonical.
  useEffect(() => {
    if (canonical !== undefined && canonical !== window.location.pathname) {
      navigate(canonical, { replace: true });
    }
  }, [canonical, route]);
  return { openTask, chats, open };
};

/**
 * Opens the task of the open chat `open`, among the sessions `sessions` and the tasks `tasks`, when the subagent of that
 * chat gets its first task while its chat stays open, such as once it creates the task with its first goal. It
 * navigates as a click does, with a new history entry, once the task is among `tasks`, since the sessions can change
 * before the tasks do. A chat that already has a task when it opens does not open it.
 */
const useFirstTaskOfOpenChat = (
  open: Chat | undefined,
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
) => {
  const taskId =
    open?.role === 'subagent' ? (sessions?.find((session) => session.sessionId === open.key)?.taskId ?? null) : null;
  const [seen, setSeen] = useState({ key: open?.key, taskId });
  const [pending, setPending] = useState<{ key: string; taskId: number }>();
  if (seen.key !== open?.key || seen.taskId !== taskId) {
    setSeen({ key: open?.key, taskId });
    if (open !== undefined && seen.key === open.key && seen.taskId === null && taskId !== null) {
      setPending({ key: open.key, taskId });
    }
  }
  useEffect(() => {
    if (pending === undefined) {
      return;
    }
    if (open?.key !== pending.key) {
      setPending(undefined);
      return;
    }
    const task = tasks?.find((candidate) => candidate.id === pending.taskId);
    if (task === undefined) {
      return;
    }
    setPending(undefined);
    navigate(routePath(taskRefOf(task), chatRefOf(open)));
  }, [pending, open, tasks]);
};

/**
 * The app: the header, the banner while the stream is down, and below them the sidebar beside the main column, with
 * the panel of the open task at the right. The URL holds the open chat and the open task, so a refresh, back and
 * forward keep them, and each view that opens navigates. The main column stays empty until the sessions and the tasks
 * are known. Then it shows the open chat, or the line that no agent has run in the repository while there is no chat.
 * The app fills the window, and the window never scrolls: the sidebar, the tabs of the header, the main column and the
 * task panel each scroll inside themselves. While a task is open, the sidebar lists the chats of the task. The task of
 * the open chat opens once its subagent gets it. On a narrow screen the sidebar is a row above the main column, and the
 * task panel covers both.
 */
const Shell = () => {
  const { online } = useConnection();
  const { repository, sessions, tasks, messages, readSessions } = usePageData();
  const { openTask, chats, open } = useView(sessions, tasks);
  useFirstTaskOfOpenChat(open, sessions, tasks);
  const openTaskRef = openTask && taskRefOf(openTask);
  const openChatRef = open && chatRefOf(open);

  /**
   * Opens the chat of the subagent `sessionId` that just started beside the open task. The URL names it by its session
   * id, which the shell then replaces with the name of its chat.
   */
  const openAgentChat = (sessionId: string) => navigate(routePath(openTaskRef, sessionId));

  /**
   * Opens the chat of the subagent `sessionId` that a skill started from the chat of the orchestrator, with no task
   * open, since that subagent works on no task yet. Its task opens once it gets one.
   */
  const openSkillChat = (sessionId: string) => navigate(routePath(undefined, sessionId));

  /**
   * Closes the open task, keeps the open chat, and moves the focus to the tab of the task.
   */
  const closeTask = () => {
    if (openTask !== undefined) {
      document.getElementById(taskTabIdOf(openTask.id))?.focus();
    }
    navigate(routePath(undefined, openChatRef));
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PageHeader
        repository={repository?.name}
        tasks={tasks ?? []}
        sessions={sessions ?? []}
        openTaskId={openTask?.id}
        openChat={open}
      />
      {!online && <ConnectionBanner />}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <ScrollArea className="shrink-0 border-b bg-sidebar text-sidebar-foreground md:w-60 md:border-r md:border-b-0">
          <Sidebar
            sessions={sessions ?? []}
            open={open}
            task={openTask}
            onOpen={openAgentChat}
            readSessions={readSessions}
          />
        </ScrollArea>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {chats !== undefined &&
            (open === undefined ? (
              <NoChat />
            ) : (
              <ConsolePage
                key={open.key}
                chat={open}
                messages={messages}
                online={online}
                onOpen={openSkillChat}
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
