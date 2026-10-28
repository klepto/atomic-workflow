import { Trash2, X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { TaskSummary } from '@/api/types.ts';
import { DeleteDialog } from '@/components/delete-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { TaskIdLabel } from '@/tasks/task-id-label.tsx';

/**
 * The id of the task panel, which the tab of each task names as the region that it controls.
 */
export const TASK_PANEL_ID = 'task-panel';

/**
 * Props of the task panel.
 */
export interface TaskPanelProps {
  /**
   * The open task, or `undefined` while no task is open.
   */
  task: TaskSummary | undefined;

  /**
   * Closes the panel.
   */
  onClose: () => void;
}

/**
 * The stages of a task in their order, each with the status of the task while it stands at that stage.
 */
const STAGES = [
  { status: 'plan-goals', label: 'Goals' },
  { status: 'plan-design', label: 'Design' },
  { status: 'plan-tickets', label: 'Tickets' },
  { status: 'complete', label: 'Work' },
  { status: 'done', label: 'Landed' },
] as const;

/**
 * The words of each status of a task, as the panel names it.
 */
const STATUS_WORDS: Record<string, string> = {
  'plan-goals': 'Planning the goals',
  'plan-design': 'Planning the design',
  'plan-tickets': 'Planning the tickets',
  complete: 'Plan complete, tickets in work',
  done: 'Landed on its base branch',
};

/**
 * Returns the index in `STAGES` of the stage that the status `status` stands at, or -1 for a status that no stage has.
 */
const stageIndexOf = (status: string) => STAGES.findIndex((stage) => stage.status === status);

/**
 * The stages of the task with the status `status`, as a row of bars with the name of each stage below its bar. The
 * stages before the current one are filled, the current one is filled in the primary color, and the ones after it are
 * empty. A task that has landed has every stage filled, none current.
 */
const StageTrack = ({ status }: { status: string }) => {
  const current = stageIndexOf(status);
  const landed = status === 'done';
  return (
    <ol aria-label="Stages" className="grid grid-cols-5 gap-1">
      {STAGES.map((stage, index) => {
        const passed = index < current || landed;
        const isCurrent = index === current && !landed;
        return (
          <li key={stage.status} aria-current={isCurrent ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn('h-1.5 rounded-full', isCurrent ? 'bg-primary' : passed ? 'bg-foreground/45' : 'bg-muted')}
            />
            <span className={cn('text-xs', isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {stage.label}
              <span className="sr-only">{isCurrent ? ', current' : passed ? ', passed' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * The tickets of the task `task`: how many of them landed, then one cell per ticket, filled for each that landed. It
 * reads `No tickets yet` while the task has none.
 */
const TicketCount = ({ task }: { task: TaskSummary }) => {
  if (task.totalTickets === 0) {
    return <p className="text-muted-foreground text-sm">No tickets yet</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium tabular-nums">{task.completedTickets}</span>
        <span className="text-muted-foreground">{` of ${task.totalTickets} landed`}</span>
      </p>
      <div aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: task.totalTickets }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the cells have no identity besides their place.
            key={index}
            className={cn('h-3 flex-1 rounded-[2px]', index < task.completedTickets ? 'bg-foreground/70' : 'bg-muted')}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * A section of the panel: its heading `title` above its content `children`.
 */
const PanelSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h3 className="font-semibold text-muted-foreground text-xs">{title}</h3>
    {children}
  </section>
);

/**
 * The button that deletes the task `task`, with its goals, its design, its tickets, its worktrees and branches, and its
 * subagents with their chats. It asks first in a dialog above the whole window, which says that the deletion cannot be
 * undone. When the deletion fails, such as for commits that have not landed, the dialog shows why, and offers to
 * delete the task anyway, which loses that work. Once the task is deleted, it leaves the tasks, and the panel closes.
 */
const DeleteTask = ({ task }: { task: TaskSummary }) => (
  <DeleteDialog
    trigger={
      <Button
        variant="ghost"
        size="icon"
        className="size-[1.625rem] shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete task"
      />
    }
    title={`Delete ${task.slug}?`}
    description="This deletes the task with its goals, design and tickets, removes its worktrees and branches, and deletes the chats of its agents. You cannot undo it."
    confirm="Delete task"
    retry={{
      confirm: 'Delete anyway',
      note: 'Delete anyway to also lose the commits that have not landed and the uncommitted changes.',
    }}
    onDelete={async (retried) => {
      await call('taskDelete', { task: task.id, force: retried });
    }}
  >
    <Trash2 aria-hidden="true" />
  </DeleteDialog>
);

/**
 * The content of the panel for the task `task`: its slug, its id and the day it was created, with the buttons that
 * delete the task and close the panel, then its status with its stages, then its tickets.
 */
const TaskDetails = ({ task, onClose }: { task: TaskSummary; onClose: () => void }) => (
  <div className="flex flex-col gap-8 px-6 py-5">
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="truncate font-semibold text-lg leading-7 tracking-tight">
          {task.slug}
          <TaskIdLabel id={String(task.id)} />
        </h2>
        <p className="text-muted-foreground text-xs">
          {`Created ${new Date(task.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
        </p>
      </div>
      <div className="-mr-1 flex shrink-0 items-center gap-0.5">
        <DeleteTask task={task} />
        <Button
          variant="ghost"
          size="icon"
          className="size-[1.725rem] shrink-0"
          aria-label="Close task"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-[1.2rem]" />
        </Button>
      </div>
    </div>
    <PanelSection title="Status">
      <p className="font-medium text-base">{STATUS_WORDS[task.status] ?? task.status}</p>
      <StageTrack status={task.status} />
    </PanelSection>
    <PanelSection title="Tickets">
      <TicketCount task={task} />
    </PanelSection>
  </div>
);

/**
 * The task panel at the right of the page, which shows the open task `task` beside the open chat. It slides out from
 * the right edge when a task opens, and back when it closes, without the motion when the user asks for less. While it
 * slides back, it keeps the task that it showed last. On a narrow screen it covers the chat instead of standing beside
 * it. A click on its close button, or Escape inside it but outside its dialogs, calls `onClose`. While closed, nothing
 * in it takes focus.
 */
export const TaskPanel = ({ task, onClose }: TaskPanelProps) => {
  const [shown, setShown] = useState(task);
  if (task !== undefined && task !== shown) {
    setShown(task);
  }
  const open = task !== undefined;

  /**
   * Closes the panel on Escape, except in a dialog, whose events reach the panel from its portal.
   */
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && event.currentTarget.contains(event.target as Node)) {
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
        open ? 'translate-x-0 md:w-[26rem]' : 'translate-x-full md:w-0',
      )}
    >
      <div className="h-full w-full overflow-y-auto md:w-[26rem] md:border-l">
        {shown !== undefined && <TaskDetails task={shown} onClose={onClose} />}
      </div>
    </aside>
  );
};
