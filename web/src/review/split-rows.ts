import type { DiffLine } from '@/review/patch.ts';

/**
 * Row of the split view: the old line at the left and the new line at the right, either of them missing where the
 * change added or deleted more lines on one side. A line that both sides share is on both.
 */
interface SplitRow {
  /**
   * Old line, or `null` for none.
   */
  readonly left: DiffLine | null;

  /**
   * New line, or `null` for none.
   */
  readonly right: DiffLine | null;
}

/**
 * Returns the lines `lines` of a hunk as rows of the split view: each run of deleted lines beside the run of added
 * lines that follows it, and each shared line beside itself.
 */
export const splitRowsOf = (lines: readonly DiffLine[]): readonly SplitRow[] => {
  const rows: SplitRow[] = [];
  let deleted: DiffLine[] = [];
  let added: DiffLine[] = [];

  /**
   * Pairs the deleted and the added lines of the current run into rows, and starts a new run.
   */
  const flush = (): void => {
    for (let index = 0; index < Math.max(deleted.length, added.length); index += 1) {
      rows.push({ left: deleted[index] ?? null, right: added[index] ?? null });
    }
    deleted = [];
    added = [];
  };

  for (const line of lines) {
    if (line.kind === 'delete') {
      deleted.push(line);
    } else if (line.kind === 'add') {
      added.push(line);
    } else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
};
