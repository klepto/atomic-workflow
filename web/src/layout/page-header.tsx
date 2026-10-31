import { type MouseEvent, useEffect, useRef } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import type { Chat } from '@/chats/chat-list.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { routePath, taskRefOf } from '@/routing/route.ts';
import { isPlainClick, RouteLink } from '@/routing/route-link.tsx';
import { TaskIdLabel } from '@/tasks/task-id-label.tsx';
import { orderByActivity } from '@/tasks/task-order.ts';
import { TASK_PANEL_ID } from '@/tasks/task-panel.tsx';

/**
 * Props of `Title`.
 */
interface TitleProps {
  /**
   * Name of the repository, or `undefined` while it is not known.
   */
  readonly repository: string | undefined;

  /**
   * Path that the title links to.
   */
  readonly to: string;

  /**
   * Handles a click on the title before the link follows it.
   */
  readonly onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Props of `TaskTabs`.
 */
interface TaskTabsProps {
  /**
   * Tasks of the repository, one tab each, in the order of the tabs.
   */
  readonly tasks: readonly TaskSummary[];

  /**
   * Id of the open task, or `undefined` while no task is open.
   */
  readonly openTaskId: number | undefined;

  /**
   * Returns the path that the tab of the task `task` leads to.
   */
  readonly targetOf: (task: TaskSummary) => string;

  /**
   * Handles a click on the tab of the open task before the link follows it.
   */
  readonly onCloseClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Props of `PageHeader`.
 */
interface PageHeaderProps {
  /**
   * Name of the repository that the server serves, or `undefined` while it is not known.
   */
  readonly repository: string | undefined;

  /**
   * Tasks of the repository, in the order of their ids.
   */
  readonly tasks: readonly TaskSummary[];

  /**
   * Sessions of the repository, attached or not, as `sessionList` lists them.
   */
  readonly sessions: readonly ListedSession[];

  /**
   * Id of the open task, or `undefined` while no task is open.
   */
  readonly openTaskId: number | undefined;

  /**
   * Open chat, or `undefined` while no chat is open.
   */
  readonly openChat: Chat | undefined;
}

/**
 * Returns the id of the element of the tab of the task with the id `taskId`.
 */
export const taskTabIdOf = (taskId: number): string => `task-tab-${taskId}`;

/**
 * Scrolls the row of tabs `row` sideways so that its current tab is in view. A row whose current tab is in view, or
 * that has none, stays as it is.
 */
const revealCurrentTab = (row: HTMLElement): void => {
  const tab = row.querySelector<HTMLElement>('[aria-expanded="true"]');
  if (tab === null) {
    return;
  }
  const start = tab.offsetLeft;
  const end = start + tab.offsetWidth;
  if (start < row.scrollLeft) {
    row.scrollLeft = start;
  } else if (end > row.scrollLeft + row.clientWidth) {
    row.scrollLeft = end - row.clientWidth;
  }
};

/**
 * Returns whether the chat `chat` is among the chats of the task `taskId`, by the sessions `sessions`: the chat of the
 * main session is among the chats of every task, and the chat of subagents among those of each task that one of them
 * works on.
 */
const isChatOfTask = (chat: Chat, taskId: number, sessions: readonly ListedSession[]): boolean =>
  chat.role === 'orchestrator' ||
  sessions.some((session) => chat.sessionIds.includes(session.sessionId) && session.taskId === taskId);

/**
 * Title of the app, `atomic-workflow / <repository>`, as a link to `to`. It reads `atomic-workflow` only while
 * `repository` is `undefined`. On a narrow screen the name of the repository takes a line of its own when the title
 * does not fit on one. A click on it calls `onClick` before it follows the link.
 */
const Title = ({ repository, to, onClick }: TitleProps) => (
  <RouteLink
    to={to}
    onClick={onClick}
    className="flex min-w-0 flex-wrap items-center gap-x-1.5 rounded-md text-sm leading-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:flex-nowrap"
  >
    <span className="flex shrink-0 gap-1.5 text-muted-foreground">
      atomic-workflow
      {repository !== undefined && (
        <>
          {' '}
          <span className="text-muted-foreground/60">/</span>
        </>
      )}
    </span>
    {repository !== undefined && (
      <>
        {' '}
        <span title={repository} className="max-w-full truncate font-semibold text-foreground">
          {repository}
        </span>
      </>
    )}
  </RouteLink>
);

/**
 * Tabs of the tasks: one link for each task of `tasks`, with its id and its slug, to the path that `targetOf` returns
 * for its task. A click on the tab of the open task `openTaskId` calls `onCloseClick` before it follows the link. That
 * tab is the current one, and is marked as expanded. It has the background of the page and a border on its top and its
 * sides, and covers the line below the header, so it merges into the page below it. The row scrolls sideways when the
 * tabs do not fit, and brings the current tab into view.
 */
const TaskTabs = ({ tasks, openTaskId, targetOf, onCloseClick }: TaskTabsProps) => {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tasks.length > 0 && openTaskId !== undefined && row.current !== null) {
      revealCurrentTab(row.current);
    }
  }, [tasks.length, openTaskId]);
  return (
    <ScrollArea viewportRef={row} className="flex-1">
      <nav aria-label="Tasks">
        <ul className="flex h-12 items-stretch gap-1 px-2 pt-1.5 md:h-[3.3rem] md:px-0 md:pt-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex">
              <RouteLink
                to={targetOf(task)}
                id={taskTabIdOf(task.id)}
                aria-expanded={task.id === openTaskId}
                aria-controls={TASK_PANEL_ID}
                onClick={task.id === openTaskId ? onCloseClick : undefined}
                className="flex cursor-pointer items-center whitespace-nowrap rounded-t-md border-x border-t border-transparent px-3 text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset aria-expanded:border-border aria-expanded:bg-background aria-expanded:font-medium aria-expanded:text-foreground"
              >
                <TaskIdLabel id={task.id} />
                <span>{task.slug}</span>
              </RouteLink>
            </li>
          ))}
        </ul>
      </nav>
    </ScrollArea>
  );
};

/**
 * Header across the top of the app: the title, and one tab per task, in the order of the last activity of the tasks, the
 * latest first, as `orderByActivity` orders them. Each is a link. The title and the tab of the open task lead to the
 * open chat with no task open, so they close the task, and a plain click on either moves the focus to the tab of the
 * task. The tab of another task leads to that task with the open chat when the open chat is among the chats of the
 * task, and with its first chat otherwise. On a narrow screen the tabs take a row below the title. The row of tabs is
 * not shown while there is no task. The top right corner of the header stays free. The header has the background of
 * the sidebar, and a line along its bottom that the current tab covers. The title is at least as wide as the sidebar,
 * so that the tabs start to the right of it, and on a wide screen its text is at the height of the text of the tabs.
 */
export const PageHeader = ({ repository, tasks, sessions, openTaskId, openChat }: PageHeaderProps) => {
  // A path to another view names the chat by its name, which every view finds.
  const openChatRef = openChat?.name;
  const closeTarget = routePath(undefined, openChatRef);

  /**
   * Returns the path that the tab of the task `task` leads to.
   */
  const targetOf = (task: TaskSummary): string => {
    if (task.id === openTaskId) {
      return closeTarget;
    }
    const keepsChat = openChat !== undefined && isChatOfTask(openChat, task.id, sessions);
    return routePath(taskRefOf(task), keepsChat ? openChatRef : undefined);
  };

  /**
   * Moves the focus to the tab of the open task on a plain click `event`, which closes the task in place.
   */
  const focusOpenTab = (event: MouseEvent<HTMLAnchorElement>) => {
    if (openTaskId !== undefined && isPlainClick(event)) {
      document.getElementById(taskTabIdOf(openTaskId))?.focus();
    }
  };

  return (
    <header className="bg-sidebar shadow-[inset_0_-1px_0_var(--color-border)]">
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-6 md:pr-44 md:pl-6">
        <div className="flex min-h-[3.3rem] min-w-0 items-center py-1.5 pr-36 pl-4 md:h-[3.3rem] md:min-w-48 md:max-w-sm md:shrink-0 md:pt-2 md:pr-0 md:pb-0 md:pl-0">
          <Title repository={repository} to={closeTarget} onClick={focusOpenTab} />
        </div>
        {tasks.length > 0 && (
          <TaskTabs
            tasks={orderByActivity(tasks, sessions)}
            openTaskId={openTaskId}
            targetOf={targetOf}
            onCloseClick={focusOpenTab}
          />
        )}
      </div>
    </header>
  );
};
