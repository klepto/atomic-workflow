import { LoaderCircle, Play, Square, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { DeleteDialog } from '@/components/delete-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { errorMessage } from '@/lib/error-message.ts';
import { isRunActive, runStateOf } from '@/tasks/run-state.ts';

/**
 * Props of `HeaderAction`.
 */
interface HeaderActionProps {
  /**
   * Accessible name of the button.
   */
  readonly label: string;

  /**
   * Hint of the button, which says what it does.
   */
  readonly description: string;

  /**
   * Icon that the button shows while no call runs.
   */
  readonly icon: ReactNode;

  /**
   * Reason that the button is disabled, or `undefined` while it is enabled.
   */
  readonly disabledReason: string | undefined;

  /**
   * Calls the server for the click. Rejects with the failure, whose message the hint shows.
   */
  readonly action: () => Promise<unknown>;
}

/**
 * Ghost icon button in the header of the task panel, labeled `label`, which shows `icon`, with the hint `description`.
 * A click calls `action`. From the click until the call answers, it shows a spinner and is disabled. A failure of the
 * call shows its message as the note of the hint, until the next click. The button is also disabled while
 * `disabledReason` is set, which its hint then names as its note, unless a failure shows.
 */
const HeaderAction = ({ label, description, icon, disabledReason, action }: HeaderActionProps) => {
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
      setFailure(errorMessage(error));
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
 * Props of `RunTask`.
 */
interface RunTaskProps {
  /**
   * Task that the button runs.
   */
  readonly task: TaskSummary;

  /**
   * Whether a run of the task is active.
   */
  readonly active: boolean;
}

/**
 * Button that runs the task `task` unattended to its end: it sends `/atomic-workflow:run <task id>` to the orchestrator
 * of the task with `taskOrchestratorDeliver`, which starts the orchestrator if none is attached. It is disabled while
 * the run of the task is active, as `active` says, and while the task is `done`.
 */
const RunTask = ({ task, active }: RunTaskProps) => (
  <HeaderAction
    label="Run task"
    description="Run the task unattended to its end"
    icon={<Play aria-hidden="true" />}
    disabledReason={task.status === 'done' ? 'The task is done' : active ? 'The task is already running' : undefined}
    action={async () =>
      fetchCall('taskOrchestratorDeliver', { taskId: task.id, content: `/atomic-workflow:run ${task.id}` })
    }
  />
);

/**
 * Props of `StopTask`.
 */
interface StopTaskProps {
  /**
   * Task whose agents the button stops.
   */
  readonly task: TaskSummary;

  /**
   * Whether a subagent of the task runs or a run of it is active.
   */
  readonly stoppable: boolean;
}

/**
 * Button that stops every subagent of the task `task` with `taskStop`: its orchestrator and each subagent that
 * implements one of its tickets. The call also ends the active run of the task. It is disabled while no subagent of
 * the task runs and no run of it is active, as `stoppable` says, so a run that its agent left open can still be ended.
 */
const StopTask = ({ task, stoppable }: StopTaskProps) => (
  <HeaderAction
    label="Stop task"
    description="Stop every agent of the task"
    icon={<Square aria-hidden="true" />}
    disabledReason={stoppable ? undefined : 'No agent or run of the task is active'}
    action={async () => fetchCall('taskStop', { taskId: task.id })}
  />
);

/**
 * Props of `DeleteTask`.
 */
interface DeleteTaskProps {
  /**
   * Task that the button deletes.
   */
  readonly task: TaskSummary;
}

/**
 * Button that deletes the task `task`, with its goals, its design, its tickets, its worktrees and branches, and its
 * subagents with their chats. It asks first in a dialog above the whole window, which says that the deletion cannot be
 * undone. When the deletion fails, such as for commits that have not landed, the dialog shows why, and offers to
 * delete the task anyway, which loses that work. Once the task is deleted, it leaves the tasks, and the panel closes.
 */
const DeleteTask = ({ task }: DeleteTaskProps) => (
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
      await fetchCall('taskDelete', { task: task.id, force: retried });
    }}
  >
    <Trash2 aria-hidden="true" />
  </DeleteDialog>
);

/**
 * Props of `TaskActions`.
 */
interface TaskActionsProps {
  /**
   * Task that the buttons act on.
   */
  readonly task: TaskSummary;

  /**
   * Sessions of the repository, attached or not, from which the buttons learn whether a run of the task is active.
   */
  readonly sessions: readonly ListedSession[];
}

/**
 * Buttons in the header of the task panel that run, stop and delete the task `task`, by its run state among the
 * sessions `sessions`. The state of the buttons that run and stop starts over for each task.
 */
export const TaskActions = ({ task, sessions }: TaskActionsProps) => {
  const { active, running } = runStateOf(task.id, sessions);
  return (
    <>
      <RunTask key={`run-${task.id}`} task={task} active={active} />
      <StopTask key={`stop-${task.id}`} task={task} stoppable={running || isRunActive(task)} />
      <DeleteTask task={task} />
    </>
  );
};
