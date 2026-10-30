import type { ThemedToken } from 'shiki/core';
import { highlighterOf, type LanguageHighlighter, languageOfPath, MAX_HIGHLIGHT_LINES } from '@/lib/code-highlight.ts';
import { useHighlight } from '@/lib/use-highlight.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Colored pieces of the text of each line of a file, by the line of the diff that holds the text. A line without an
 * entry shows its text without colors.
 */
export type FileHighlight = ReadonlyMap<DiffLine, readonly ThemedToken[]>;

/**
 * Colors of each file that was colored once, so that a file that shows again does not color again.
 */
const highlights = new WeakMap<FileDiff, FileHighlight>();

/**
 * Colors the lines `lines` of one side of a hunk as one piece of code with `highlighter`, so that a construct that
 * spans lines, such as a block comment, colors each of its lines, and adds the colors of each line to `colors`.
 */
const colorSide = (
  highlighter: LanguageHighlighter,
  lines: readonly DiffLine[],
  colors: Map<DiffLine, readonly ThemedToken[]>,
): void => {
  const tokens = highlighter.tokenize(lines.map((line) => line.text).join('\n'));
  // A line that holds a line break of its own splits in two, so its colors would land on the lines below it.
  if (tokens.length !== lines.length) return;
  for (const [index, line] of lines.entries()) {
    colors.set(line, tokens[index] ?? []);
  }
};

/**
 * Colors the old and then the new side of the hunk `hunk` with `highlighter`, so that a line both sides share keeps
 * the colors of its new side, and adds the colors of each line to `colors`.
 */
const colorHunk = (
  highlighter: LanguageHighlighter,
  hunk: DiffHunk,
  colors: Map<DiffLine, readonly ThemedToken[]>,
): void => {
  colorSide(
    highlighter,
    hunk.lines.filter((line) => line.kind !== 'add'),
    colors,
  );
  colorSide(
    highlighter,
    hunk.lines.filter((line) => line.kind !== 'delete'),
    colors,
  );
};

/**
 * Returns the colors of the lines of the file `file` with `highlighter`, each hunk colored on its own.
 */
const colorFile = (file: FileDiff, highlighter: LanguageHighlighter): FileHighlight => {
  const colors = new Map<DiffLine, readonly ThemedToken[]>();
  for (const hunk of file.hunks) {
    colorHunk(highlighter, hunk, colors);
  }
  return colors;
};

/**
 * Returns the colors of the lines of the file `file`, or `undefined` when the language of the file gets no colors, or
 * the file has more lines than `MAX_HIGHLIGHT_LINES`. The promise rejects when the highlighter or the grammar fails to
 * load.
 */
const highlightFile = (file: FileDiff): Promise<FileHighlight> | undefined => {
  const loadLanguage = languageOfPath(file.path);
  const lineCount = file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
  if (loadLanguage === undefined || lineCount > MAX_HIGHLIGHT_LINES) return undefined;
  return highlighterOf(loadLanguage).then((highlighter) => colorFile(file, highlighter));
};

/**
 * Returns the colors of the lines of the file `file`, or `undefined` while they load, and for a file that gets no
 * colors. If the colors fail to load, the file keeps showing its text without colors.
 */
export const useFileHighlight = (file: FileDiff): FileHighlight | undefined =>
  useHighlight(file, highlights, highlightFile);
