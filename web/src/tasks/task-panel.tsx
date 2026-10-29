import { LoaderCircle, Play, Square, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { DeleteDialog } from '@/components/delete-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import { RunTimer, isRunActive } from '@/tasks/run-timer.tsx';
import { TaskIdLabel } from '@/tasks/task-id-label.tsx';
import { TicketList } from '@/tasks/ticket-list.tsx';
import { useGoals } from '@/tasks/use-goals.ts';

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
   * Every session of the repository, attached or not, from which the panel learns whether a run of the open task is
   * active.
   */
  sessions: readonly ListedSession[];

  /**
   * Closes the panel.
   */
  onClose: () => void;

  /**
   * Opens the chat of the subagent `sessionId` beside the task, such as the orchestrator of the task once it took over
   * an approval.
   */
  onOpenChat: (sessionId: string) => void;
}

/**
 * The stages of a task in their order, each with its label and the words that the panel names the task by while it
 * stands at that stage.
 */
const STAGES = [
  { stage: 'plan', label: 'Plan', words: 'Planning' },
  { stage: 'implement', label: 'Implement', words: 'Plan complete, tickets in work' },
  { stage: 'review', label: 'Review', words: 'Every ticket landed, waiting for approval' },
  { stage: 'done', label: 'Done', words: 'Landed on its base branch' },
] as const;

/**
 * A stage of a task, as the panel shows it.
 */
type Stage = (typeof STAGES)[number]['stage'];

/**
 * The words of each status of a task while it stands at the stage `plan`, which name the phase of planning.
 */
const PLAN_WORDS: Record<string, string> = {
  'plan-goals': 'Planning the goals',
  'plan-design': 'Planning the design',
  'plan-tickets': 'Planning the tickets',
};

/**
 * Returns the stage that the task `task` stands at: `plan` while any phase of planning runs, `implement` once the plan
 * is complete, `review` once the work of every ticket landed but the task did not, and `done` once the task landed. If
 * the status of the task has no stage, returns `undefined` instead.
 */
const stageOf = (task: TaskSummary): Stage | undefined => {
  if (task.status === 'done') return 'done';
  if (task.status === 'complete') {
    return task.totalTickets > 0 && task.completedTickets === task.totalTickets ? 'review' : 'implement';
  }
  return task.status in PLAN_WORDS ? 'plan' : undefined;
};

/**
 * Returns the words that the panel names the status of the task `task` by: the phase of planning while it plans, else
 * the words of its stage, else its status as it is.
 */
const statusWordsOf = (task: TaskSummary) =>
  PLAN_WORDS[task.status] ?? STAGES.find(({ stage }) => stage === stageOf(task))?.words ?? task.status;

/**
 * The stages of a task that stands at the stage `stage`, as a row of bars with the name of each stage below its bar.
 * The stages before the current one are filled, the current one is filled in the primary color, and the ones after it
 * are empty. A task that has landed stands at its last stage, `Done`.
 */
const StageTrack = ({ stage: currentStage }: { stage: Stage | undefined }) => {
  const current = STAGES.findIndex(({ stage }) => stage === currentStage);
  return (
    <ol aria-label="Stages" className="grid grid-cols-4 gap-1">
      {STAGES.map((stage, index) => {
        const passed = index < current;
        const isCurrent = index === current;
        return (
          <li key={stage.stage} aria-current={isCurrent ? 'step' : undefined} className="flex flex-col gap-1.5">
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
 * The goals of the task `task` in the order of their ids, each with its id, its summary and its details below. It
 * reads `No goals yet` while the task has none, and shows nothing until the first read of the goals answered.
 */
const GoalList = ({ task }: { task: TaskSummary }) => {
  const goals = useGoals(task);
  if (goals === undefined) return null;
  if (goals.length === 0) {
    return <p className="text-muted-foreground text-sm">No goals yet</p>;
  }
  return (
    <ol aria-label="Goals" className="flex flex-col gap-2.5">
      {goals.map((goal) => (
        <li key={goal.id} className="flex gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground tabular-nums">{`${goal.id}.`}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-medium">{goal.summary}</p>
            {goal.details !== null && (
              <p className="whitespace-pre-line text-muted-foreground text-xs">{goal.details}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
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
    hint="Delete the task with its plan, branches and chats"
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
 * Whether a run of a task is active, and whether any of its subagents runs.
 */
interface RunState {
  /**
   * Whether a subagent of the task is `working` or `waiting`.
   */
  active: boolean;

  /**
   * Whether a subagent of the task has a status other than `ended`.
   */
  running: boolean;
}

/**
 * Returns the run state of the task `taskId` among the sessions `sessions`, whose subagents of the task are the ones
 * with the role `subagent` and the task id `taskId`.
 */
const runStateOf = (taskId: number, sessions: readonly ListedSession[]): RunState => {
  const subagents = sessions.filter((session) => session.role === 'subagent' && session.taskId === taskId);
  return {
    active: subagents.some((session) => session.status === 'working' || session.status === 'waiting'),
    running: subagents.some((session) => session.status !== 'ended'),
  };
};

/**
 * A ghost icon button in the header of the panel, labeled `label`, which shows `icon`, with the hint `description`. A
 * click calls `action`. From the click until the call answers, it shows a spinner and is disabled. A failure of the
 * call shows its message as the note of the hint, until the next click. The button is also disabled while
 * `disabledReason` is set, which its hint then names as its note, unless a failure shows.
 */
const HeaderAction = ({
  label,
  description,
  icon,
  disabledReason,
  action,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  disabledReason: string | undefined;
  action: () => Promise<unknown>;
}) => {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * Calls the action, and keeps the message of a failure.
   */
  const click = async () => {
    setFailure(undefined);
    setPending(true);
    try {
      await action();
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Hint description={description} note={failure ?? disabledReason}>
      <Button
        variant="ghost"
        size="icon"
        className="size-[1.625rem] shrink-0"
        aria-label={label}
        disabled={disabledReason !== undefined || pending}
        onClick={click}
      >
        {pending ? <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" /> : icon}
      </Button>
    </Hint>
  );
};

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The button that runs the task `task` unattended to its end: it sends `/atomic-workflow:run <task id>` to the
 * orchestrator of the task with `taskOrchestratorDeliver`, which starts the orchestrator if none is attached. It is
 * disabled while the run of the task is active, as `active` says, and while the task is `done`.
 */
const RunTask = ({ task, active }: { task: TaskSummary; active: boolean }) => (
  <HeaderAction
    label="Run task"
    description="Run the task unattended to its end"
    icon={<Play aria-hidden="true" />}
    disabledReason={task.status === 'done' ? 'The task is done' : active ? 'The task is already running' : undefined}
    action={() => call('taskOrchestratorDeliver', { taskId: task.id, content: `/atomic-workflow:run ${task.id}` })}
  />
);

/**
 * The button that stops every subagent of the task `task` with `taskStop`: its orchestrator and each subagent that
 * implements one of its tickets. The call also ends the active run of the task. It is disabled while no subagent of
 * the task runs and no run of it is active, as `stoppable` says, so a run that its agent left open can still be ended.
 */
const StopTask = ({ task, stoppable }: { task: TaskSummary; stoppable: boolean }) => (
  <HeaderAction
    label="Stop task"
    description="Stop every agent of the task"
    icon={<Square aria-hidden="true" />}
    disabledReason={stoppable ? undefined : 'No agent or run of the task is active'}
    action={() => call('taskStop', { taskId: task.id })}
  />
);

/**
 * The content of the panel for the task `task`: its slug, its id and the day it was created, with the buttons that
 * run, stop and delete the task and close the panel, then its status with its stages and the timer of its latest
 * unattended run, then its goals, then its tickets with the buttons that review and approve each of them.
 */
const TaskDetails = ({
  task,
  sessions,
  onClose,
  onOpenChat,
}: {
  task: TaskSummary;
  sessions: readonly ListedSession[];
  onClose: () => void;
  onOpenChat: (sessionId: string) => void;
}) => {
  const { active, running } = runStateOf(task.id, sessions);
  return (
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
          <RunTask key={`run-${task.id}`} task={task} active={active} />
          <StopTask key={`stop-${task.id}`} task={task} stoppable={running || isRunActive(task)} />
          <DeleteTask task={task} />
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
};

/**
 * The task panel at the right of the page, which shows the open task `task` beside the open chat. It slides out from
 * the right edge when a task opens, and back when it closes, without the motion when the user asks for less. While it
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
