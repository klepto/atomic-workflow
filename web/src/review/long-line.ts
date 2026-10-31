import type { FileDiff } from '@/review/patch.ts';

/**
 * Longest line of a file that shows unfolded and whole, in characters. A file with a longer line, such as one of
 * minified code, shows folded, and the longer line shows cut until the reviewer shows it whole.
 */
export const LONG_LINE_LENGTH = 1000;

/**
 * Returns whether the file `file` holds a line longer than `LONG_LINE_LENGTH`.
 */
export const hasLongLine = (file: FileDiff): boolean =>
  file.hunks.some((hunk) => hunk.lines.some((line) => line.text.length > LONG_LINE_LENGTH));
