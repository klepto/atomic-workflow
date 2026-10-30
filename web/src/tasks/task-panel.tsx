import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import { GoalList } from '@/tasks/goal-list.tsx';
import { RunTimer } from '@/tasks/run-timer.tsx';
import { StageTrack } from '@/tasks/stage-track.tsx';
import { TaskActions } from '@/tasks/task-actions.tsx';
import { TaskIdLabel } from '@/tasks/task-id-label.tsx';
import { stageOf, statusWordsOf } from '@/tasks/task-stage.ts';
import { TicketCount } from '@/tasks/ticket-count.tsx';
import { TicketList } from '@/tasks/ticket-list.tsx';

/**
 * Id of the task panel, which the tab of each task names as the region that it controls.
 */
export const TASK_PANEL_ID = 'task-panel';

/**
 * Props of `PanelSection`.
 */
interface PanelSectionProps {
  /**
   * Heading of the section.
   */
  readonly title: string;

  /**
   * Content of the section.
   */
  readonly children: ReactNode;
}

/**
 * Section of the task panel: its heading `title` above its content `children`.
 */
const PanelSection = ({ title, children }: PanelSectionProps) => (
  <section className="flex flex-col gap-3">
    <h3 className="font-semibold text-muted-foreground text-xs">{title}</h3>
    {children}
  </section>
);

/**
 * Props of `TaskDetails`.
 */
interface TaskDetailsProps {
  /**
   * Task that the details show.
   */
  readonly task: TaskSummary;

  /**
   * Sessions of the repository, attached or not, from which the details learn whether a run of the task is active.
   */
  readonly sessions: readonly ListedSession[];

  /**
   * Closes the task panel.
   */
  readonly onClose: () => void;

  /**
   * Opens the chat of the subagent `sessionId` beside the task.
   */
  readonly onOpenChat: (sessionId: string) => void;
}

/**
 * Content of the task panel for the task `task`: its slug, its id and the day it was created, with the buttons that
 * run, stop and delete the task and close the panel, then its status with its stages and the timer of its latest
 * unattended run, then its goals, then its tickets with the buttons that review and approve each of them.
 */
const TaskDetails = ({ task, sessions, onClose, onOpenChat }: TaskDetailsProps) => (
  <div className="flex flex-col gap-8 px-6 py-5">
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate font-semibold text-lg leading-7 tracking-tight">
          {task.slug}
          <TaskIdLabel id={task.id} />
        </h2>
        <p className="text-muted-foreground text-xs">
          {`Created ${new Date(task.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
        </p>
      </div>
      <div className="-mr-1 flex shrink-0 items-center gap-0.5">
        <TaskActions task={task} sessions={sessions} />
        <Hint description="Close the task panel">
          <Button
            variant="ghost"
            size="icon"
            className="size-[1.725rem] shrink-0"
            aria-label="Close task"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-[1.452rem]" />
          </Button>
        </Hint>
      </div>
    </div>
    <PanelSection title="Status">
      <p className="font-medium text-base">{statusWordsOf(task)}</p>
      <StageTrack stage={stageOf(task)} />
      <RunTimer task={task} />
    </PanelSection>
    <PanelSection title="Goals">
      <GoalList task={task} />
    </PanelSection>
    <PanelSection title="Tickets">
      <TicketCount task={task} />
      <TicketList task={task} onOpenChat={onOpenChat} />
    </PanelSection>
  </div>
);

/**
 * Props of `TaskPanel`.
 */
interface TaskPanelProps {
  /**
   * Open task, or `undefined` while no task is open.
   */
  readonly task: TaskSummary | undefined;

  /**
   * Sessions of the repository, attached or not, from which the panel learns whether a run of the open task is
   * active.
   */
  readonly sessions: readonly ListedSession[];

  /**
   * Closes the panel.
   */
  readonly onClose: () => void;

  /**
   * Opens the chat of the subagent `sessionId` beside the task, such as the orchestrator of the task once it took over
   * an approval.
   */
  readonly onOpenChat: (sessionId: string) => void;
}

/**
 * Task panel at the right of the page, which shows the open task `task` beside the open chat. It slides out from the
 * right edge when a task opens, and back when it closes, without the motion when the user asks for less. While it
 * slides back, it keeps the task that it showed last. On a narrow screen it covers the chat instead of standing beside
 * it. A click on its close button, or Escape inside it but outside its dialogs, calls `onClose`. While closed, nothing
 * in it takes focus.
 */
export const TaskPanel = ({ task, sessions, onClose, onOpenChat }: TaskPanelProps) => {
  const [shown, setShown] = useState(task);
  if (task !== undefined && task !== shown) {
    setShown(task);
  }
  const open = task !== undefined;

  /**
   * Closes the panel on Escape, except in a dialog, whose events reach the panel from its portal.
   */
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && event.target instanceof Node && event.currentTarget.contains(event.target)) {
      onClose();
    }
  };

  return (
    <aside
      id={TASK_PANEL_ID}
      aria-label="Task"
      inert={!open}
      onKeyDown={closeOnEscape}
      className={cn(
        'absolute inset-0 z-20 overflow-hidden bg-background transition-[translate,width] duration-300 ease-out motion-reduce:transition-none md:static md:inset-auto md:shrink-0 md:translate-x-0',
        open ? 'translate-x-0 md:w-[28.6rem]' : 'translate-x-full md:w-0',
      )}
    >
      <div className="h-full w-full overflow-y-auto md:w-[28.6rem] md:border-l">
        {shown !== undefined && (
          <TaskDetails task={shown} sessions={sessions} onClose={onClose} onOpenChat={onOpenChat} />
        )}
      </div>
    </aside>
  );
};
