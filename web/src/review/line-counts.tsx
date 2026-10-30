/**
 * Props of `LineCounts`.
 */
interface LineCountsProps {
  /**
   * Number of the added lines.
   */
  readonly additions: number;

  /**
   * Number of the deleted lines.
   */
  readonly deletions: number;
}

/**
 * Count of the added and the deleted lines of a file or of a change, such as `+12 −3`.
 */
export const LineCounts = ({ additions, deletions }: LineCountsProps) => (
  <span className="shrink-0 font-medium font-mono text-xs tabular-nums">
    <span className="text-diff-add-foreground">{`+${additions}`}</span>
    <span className="sr-only"> lines added, </span>
    <span className="ml-1.5 text-diff-delete-foreground">{`−${deletions}`}</span>
    <span className="sr-only"> lines deleted</span>
  </span>
);
