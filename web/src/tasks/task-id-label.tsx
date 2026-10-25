/**
 * Props of the label of a task id.
 */
export interface TaskIdLabelProps {
  /**
   * The id of the task, without the `#`.
   */
  id: string;
}

/**
 * The id of a task as muted text, `#<id>`, to stand beside the slug of the task. The `#` is display text only. A screen
 * reader hears the words `task <id>` after the slug, such as `demo, task 7`.
 */
export const TaskIdLabel = ({ id }: TaskIdLabelProps) => (
  <span className="ml-1 font-normal text-muted-foreground">
    <span aria-hidden="true">{`#${id}`}</span>
    <span className="sr-only">{`, task ${id}`}</span>
  </span>
);
