import type { ReviewFile } from '@/review/use-changes.ts';

/**
 * Why a file shows folded until the reviewer unfolds it: `Generated` for build output or a minified file, and
 * `Long lines` for a file with a line longer than `LONG_LINE_LENGTH`.
 */
export type FoldReason = 'Generated' | 'Long lines';

/**
 * Returns why the file `file` shows folded until the reviewer unfolds it, or `undefined` when it shows unfolded. A file
 * whose lines did not load yet shows folded only when it is generated, since its long lines are not known yet.
 */
export const foldReasonOf = (file: ReviewFile): FoldReason | undefined => {
  if (file.summary.generated) return 'Generated';
  if (file.lines.state === 'loaded' && file.lines.longLines) return 'Long lines';
  return undefined;
};
