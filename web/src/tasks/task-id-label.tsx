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
 * Id of a task as muted text, `#<id>`, to stand beside the slug of the task. The `#` is display text only. A screen
 * reader hears the words `task <id>` after the slug, such as `demo, task 7`.
 */
export const TaskIdLabel = ({ id }: TaskIdLabelProps) => (
  <span className="ml-1 font-normal text-muted-foreground">
    <span aria-hidden="true">{`#${id}`}</span>
    <span className="sr-only">{`, task ${id}`}</span>
  </span>
);
