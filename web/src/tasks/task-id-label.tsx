/**
 * Props of `TaskIdLabel`.
 */
interface TaskIdLabelProps {
  /**
   * Id of the task.
   */
  readonly id: number;
}

/**
 * Id of a task as muted text, `<id>.`, to stand before the slug of the task, such as `13. atomic-merge-guarantees`.
 * The period is display text only. A screen reader hears the words `task <id>` before the slug, such as
 * `task 7, demo`.
 */
export const TaskIdLabel = ({ id }: TaskIdLabelProps) => (
  <span className="mr-1 font-normal text-muted-foreground">
    <span aria-hidden="true">{`${id}.`}</span>
    <span className="sr-only">{`task ${id}, `}</span>
  </span>
);
