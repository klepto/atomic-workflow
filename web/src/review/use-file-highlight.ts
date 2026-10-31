import { systemClock } from '@/lib/clock.system.ts';
import { highlighterOf, languageOfPath, MAX_HIGHLIGHT_LINES } from '@/lib/code-highlight.ts';
import { useHighlight } from '@/lib/use-highlight.ts';
import { colorFile, type FileHighlight } from '@/review/file-highlight.ts';
import type { FileDiff } from '@/review/patch.ts';

/**
 * Colors of each file that was colored once, so that a file that shows again does not color again.
 */
const highlights = new WeakMap<FileDiff, FileHighlight>();

/**
 * Returns the colors of the lines of the file `file`, or `undefined` when the language of the file gets no colors, or
 * the file has more lines than `MAX_HIGHLIGHT_LINES`. The promise rejects when the highlighter or the grammar fails to
 * load.
 */
const highlightFile = (file: FileDiff): Promise<FileHighlight> | undefined => {
  const loadLanguage = languageOfPath(file.path);
  const lineCount = file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
  if (loadLanguage === undefined || lineCount > MAX_HIGHLIGHT_LINES) return undefined;
  return highlighterOf(loadLanguage).then((highlighter) => colorFile(file, highlighter, systemClock));
};

/**
 * Returns the colors of the lines of the file `file`, or `undefined` while they load, and for a file that gets no
 * colors. If the colors fail to load, the file keeps showing its text without colors.
 */
export const useFileHighlight = (file: FileDiff): FileHighlight | undefined =>
  useHighlight(file, highlights, highlightFile);
