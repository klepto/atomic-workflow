import { useConnection } from '@/api/use-connection.ts';
import { usePageData } from '@/api/use-page-data.ts';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { HintProvider } from '@/components/ui/hint.tsx';
import { NoChat } from '@/console/console-notices.tsx';
import { ConsolePage } from '@/console/console-page.tsx';
import { PageHeader, taskTabIdOf } from '@/layout/page-header.tsx';
import { Sidebar } from '@/layout/sidebar.tsx';
import { useFirstTaskOfOpenChat } from '@/layout/use-first-task-of-open-chat.ts';
import { useView } from '@/layout/use-view.ts';
import { navigate } from '@/routing/navigation.ts';
import { routePath, taskRefOf } from '@/routing/route.ts';
import { TaskPanel } from '@/tasks/task-panel.tsx';
import { ThemePicker } from '@/theme/theme-picker.tsx';
import { TicketPage } from '@/tickets/ticket-page.tsx';

/**
 * Banner below the header while the stream of the page is down. Messages and new agents fail until the server is back.
 * It stays in view while the page scrolls.
 */
const ConnectionBanner = () => (
  <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
    <AlertDescription className="text-destructive">
      Server not reachable. Messages and new agents fail until it is back.
    </AlertDescription>
  </Alert>
);

/**
 * Frame of the app: the header, the banner while the stream is down, and below them the sidebar beside the main column,
 * with the panel of the open task at the right. The URL holds the open chat and the open task, so a refresh, back and
 * forward keep them, and each view that opens navigates. The main column stays empty until the sessions and the tasks
 * are known. Then it shows the open chat, or the line that no agent has run in the repository while there is no chat.
 * The bottom of the sidebar shows the usage limits of the Claude subscription. The app fills the window, and the window
 * never scrolls: the chats of the sidebar, the tabs of the header, the main column and the task panel each scroll
 * inside themselves, so the sidebar reaches the bottom of the window and its usage limits stay in view.
 * While a task is open, the sidebar lists the chats of the task. The task of the open chat opens once its subagent gets
 * it. On a narrow screen the sidebar is a row above the main column, and the task panel covers both. The top of the
 * main column fades smoothly from the background of the page to transparent, so its content fades out as it scrolls
 * up under the header.
 */
const Shell = () => {
  const { online } = useConnection();
  const { repository, sessions, tasks, usage, messages, readSessions } = usePageData();
  const { openTask, chats, open, ticket } = useView(sessions, tasks);
  useFirstTaskOfOpenChat(open, sessions, tasks);
  const openTaskRef = openTask && taskRefOf(openTask);

  /**
   * Opens the chat of the subagent `sessionId` that just started beside the open task. The URL names it by its session
   * id, which the shell then replaces with the name of its chat.
   */
  const openAgentChat = (sessionId: string) => navigate(routePath(openTaskRef, sessionId));

  /**
   * Opens the chat of the new subagent `sessionId` that took a skill from the chat of the main session, with no task
   * open, since it works on no task yet. Its task opens once it gets one.
   */
  const openSkillChat = (sessionId: string) => navigate(routePath(undefined, sessionId));

  /**
   * Reads the sessions again, then opens the chat of the subagent `sessionId` beside the open task, such as the
   * orchestrator of the task once the task panel handed it a command.
   */
  const openTaskChat = async (sessionId: string) => {
    await readSessions();
    navigate(routePath(openTaskRef, sessionId));
  };

  /**
   * Closes the open task, keeps the open chat, and moves the focus to the tab of the task.
   */
  const closeTask = () => {
    if (openTask !== undefined) {
      document.getElementById(taskTabIdOf(openTask.id))?.focus();
    }
    navigate(routePath(undefined, open?.name));
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
        <div className="flex shrink-0 flex-col border-b bg-sidebar text-sidebar-foreground md:w-60 md:border-r md:border-b-0">
          <Sidebar
            sessions={sessions ?? []}
            chats={chats ?? []}
            open={open}
            task={openTask}
            usage={usage}
            onOpen={openAgentChat}
            readSessions={readSessions}
          />
        </div>
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-fade-from-background"
          />
          {openTask !== undefined && ticket !== undefined ? (
            <TicketPage
              key={openTask.id}
              task={openTask}
              ticketRef={ticket.ref}
              view={ticket.view}
              onOpenChat={(sessionId) => void openTaskChat(sessionId)}
            />
          ) : (
            chats !== undefined &&
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
            ))
          )}
        </main>
        <TaskPanel task={openTask} sessions={sessions ?? []} onClose={closeTask} onOpenChat={openTaskChat} />
      </div>
    </div>
  );
};

/**
 * Web app of atomic-workflow, with the theme picker at the top right of every page, and the provider of the hints of
 * its buttons around both.
 */
export const App = () => (
  <HintProvider>
    <Shell />
    <div className="absolute top-2.5 right-4 z-50">
      <ThemePicker />
    </div>
  </HintProvider>
);
