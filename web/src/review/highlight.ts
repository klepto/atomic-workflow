import { useEffect, useState } from 'react';
import type { ThemedToken } from 'shiki/core';
import { highlighterOf, type LanguageHighlighter, languageOfPath } from '@/lib/code-highlight.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * The colored pieces of the text of each line of a file, by the line of the diff that holds the text. A line without
 * an entry shows its text without colors.
 */
export type FileHighlight = ReadonlyMap<DiffLine, readonly ThemedToken[]>;

/**
 * The most lines of a file that get colors. A larger file shows its text without colors, so that it does not hold up
 * the page.
 */
const MAX_LINES = 5000;

/**
 * Colors the lines `lines` of one side of a hunk as one piece of code with `highlighter`, so that a construct that
 * spans lines, such as a block comment, colors each of its lines, and adds the colors of each line to `colors`.
 */
const colorSide = (
  highlighter: LanguageHighlighter,
  lines: readonly DiffLine[],
  colors: Map<DiffLine, readonly ThemedToken[]>,
) => {
  const tokens = highlighter.tokenize(lines.map((line) => line.text).join('\n'));
  // A line that holds a line break of its own splits in two, so its colors would land on the lines below it.
  if (tokens.length !== lines.length) return;
  for (const [index, line] of lines.entries()) {
    colors.set(line, tokens[index] ?? []);
  }
};

/**
 * Colors the old and then the new side of the hunk `hunk`, so that a line both sides share keeps the colors of its new
 * side.
 */
const colorHunk = (highlighter: LanguageHighlighter, hunk: DiffHunk, colors: Map<DiffLine, readonly ThemedToken[]>) => {
  const oldLines = hunk.lines.filter((line) => line.kind !== 'add');
  const newLines = hunk.lines.filter((line) => line.kind !== 'delete');
  colorSide(highlighter, oldLines, colors);
  colorSide(highlighter, newLines, colors);
};

/**
 * Returns the colors of the lines of the file `file`, each hunk colored on its own. If the language of the file gets
 * no colors, or the file is too large, returns no colors instead.
 */
const highlightFile = async (file: FileDiff): Promise<FileHighlight> => {
  const colors = new Map<DiffLine, readonly ThemedToken[]>();
  const loadLanguage = languageOfPath(file.path);
  const lineCount = file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
  if (loadLanguage === undefined || lineCount > MAX_LINES) return colors;
  const highlighter = await highlighterOf(loadLanguage);
  for (const hunk of file.hunks) {
    colorHunk(highlighter, hunk, colors);
  }
  return colors;
};

/**
 * The colors of each file that was colored once, so that a file that shows again does not color again.
 */
const highlights = new WeakMap<FileDiff, FileHighlight>();

/**
 * Returns the colors of the lines of the file `file`, or `undefined` while they load. If the colors fail to load, the
 * file keeps showing its text without colors.
 */
export const useFileHighlight = (file: FileDiff): FileHighlight | undefined => {
  const [highlight, setHighlight] = useState(() => highlights.get(file));

  useEffect(() => {
    const known = highlights.get(file);
    setHighlight(known);
    if (known !== undefined) return;
    let current = true;
    highlightFile(file).then(
      (loaded) => {
        highlights.set(file, loaded);
        if (current) setHighlight(loaded);
      },
      (error: unknown) => console.error(`Failed to color the code of ${file.path}.`, error),
    );
    return () => {
      current = false;
    };
  }, [file]);

  return highlight;
};
