import { type MouseEvent, useEffect, useRef } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type Chat, listChats } from '@/chats/chat-list.ts';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { chatRefOf, routePath, taskRefOf } from '@/routing/route.ts';
import { isPlainClick, RouteLink } from '@/routing/route-link.tsx';
import { TaskIdLabel } from '@/tasks/task-id-label.tsx';
import { TASK_PANEL_ID } from '@/tasks/task-panel.tsx';

/**
 * Props of the page header: the name of the repository, the tasks, the sessions, the open task and the open chat.
 */
export interface PageHeaderProps {
  /**
   * The name of the repository that the server serves, or `undefined` while it is not known.
   */
  repository: string | undefined;

  /**
   * The tasks of the repository, in the order of their ids.
   */
  tasks: readonly TaskSummary[];

  /**
   * The sessions of the repository, attached or not, as `sessionList` lists them.
   */
  sessions: readonly ListedSession[];

  /**
   * The id of the open task, or `undefined` while no task is open.
   */
  openTaskId: number | undefined;

  /**
   * The open chat, or `undefined` while no chat is open.
   */
  openChat: Chat | undefined;
}

/**
 * The title of the app, `atomic-workflow / <repository>`, as a link to `to`. It reads `atomic-workflow` only while
 * `repository` is `undefined`. On a narrow screen the name of the repository takes a line of its own when the title
 * does not fit on one. A click on it calls `onClick` before it follows the link.
 */
const Title = ({
  repository,
  to,
  onClick,
}: {
  repository: string | undefined;
  to: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) => (
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
 * Returns the id of the element of the tab of the task with the id `taskId`.
 */
export const taskTabIdOf = (taskId: number) => `task-tab-${taskId}`;

/**
 * The tabs of the tasks: one link for each task of `tasks`, with its slug and its id, to the path that `targetOf`
 * returns for its task. A click on the tab of the open task `openTaskId` calls `onCloseClick` before it follows the
 * link. That tab is the current one, and is marked as expanded. The row scrolls sideways when the tabs do not fit, and
 * brings the current tab into view.
 */
const TaskTabs = ({
  tasks,
  openTaskId,
  targetOf,
  onCloseClick,
}: {
  tasks: readonly TaskSummary[];
  openTaskId: number | undefined;
  targetOf: (task: TaskSummary) => string;
  onCloseClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) => {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tasks.length > 0 && openTaskId !== undefined && row.current !== null) {
      revealCurrentTab(row.current);
    }
  }, [tasks.length, openTaskId]);
  return (
    <ScrollArea viewportRef={row} className="flex-1">
      <nav aria-label="Tasks">
        <ul className="flex h-11 items-stretch gap-1 px-2 md:h-12 md:px-0">
          {tasks.map((task) => (
            <li key={task.id} className="flex">
              <RouteLink
                to={targetOf(task)}
                id={taskTabIdOf(task.id)}
                aria-expanded={task.id === openTaskId}
                aria-controls={TASK_PANEL_ID}
                onClick={task.id === openTaskId ? onCloseClick : undefined}
                className="relative flex cursor-pointer items-center whitespace-nowrap rounded-sm px-3 text-muted-foreground text-sm outline-none transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset aria-expanded:font-medium aria-expanded:text-foreground aria-expanded:after:bg-primary"
              >
                <span>{task.slug}</span>
                <TaskIdLabel id={String(task.id)} />
              </RouteLink>
            </li>
          ))}
        </ul>
      </nav>
    </ScrollArea>
  );
};

/**
 * Scrolls the row of tabs `row` sideways so that its current tab is in view. A row whose current tab is in view, or
 * that has none, stays as it is.
 */
const revealCurrentTab = (row: HTMLElement) => {
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
 * The header across the top of the app: the title, and one tab per task. Each is a link. The title and the tab of the
 * open task lead to the open chat with no task open, so they close the task, and a plain click on either moves the
 * focus to the tab of the task. The tab of another task leads to that task with the open chat when the open chat is
 * among the chats of the task, and with its first chat otherwise. On a narrow screen the tabs take a row below the
 * title. The row of tabs is not shown while there is no task. The top right corner of the header stays free.
 */
export const PageHeader = ({ repository, tasks, sessions, openTaskId, openChat }: PageHeaderProps) => {
  const openChatRef = openChat && chatRefOf(openChat);
  const closeTarget = routePath(undefined, openChatRef);

  /**
   * Returns the path that the tab of the task `task` leads to.
   */
  const targetOf = (task: TaskSummary) => {
    if (task.id === openTaskId) {
      return closeTarget;
    }
    const keepsChat = openChat !== undefined && listChats(sessions, task.id).some((chat) => chat.key === openChat.key);
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
    <header className="border-b bg-background">
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-6 md:pr-44 md:pl-6">
        <div className="flex min-h-12 min-w-0 items-center py-1.5 pr-36 pl-4 md:h-12 md:max-w-sm md:shrink-0 md:py-0 md:pr-0 md:pl-0">
          <Title repository={repository} to={closeTarget} onClick={focusOpenTab} />
        </div>
        {tasks.length > 0 && (
          <TaskTabs tasks={tasks} openTaskId={openTaskId} targetOf={targetOf} onCloseClick={focusOpenTab} />
        )}
      </div>
    </header>
  );
};
