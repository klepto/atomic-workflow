import type { TaskSummary } from '@/api/types.ts';
import { useTaskDetail } from '@/tasks/use-task-detail.ts';

/**
 * Props of `GoalList`.
 */
interface GoalListProps {
  /**
   * Task whose goals the list shows.
   */
  readonly task: TaskSummary;
}

/**
 * Goals of the task `task` in the order of their ids, each with its id, its summary and its details below. It reads
 * `No goals yet` while the task has none, and shows nothing until the first read of the goals answered.
 */
export const GoalList = ({ task }: GoalListProps) => {
  const goals = useTaskDetail(task)?.goals;
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
