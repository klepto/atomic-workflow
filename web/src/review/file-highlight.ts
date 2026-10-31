import type { GrammarState, ThemedToken } from 'shiki/core';
import type { Clock } from '@/lib/clock.ts';
import type { LanguageHighlighter } from '@/lib/code-highlight.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Colored pieces of the text of each line of a file, by the line of the diff that holds the text. A line without an
 * entry shows its text without colors.
 */
export type FileHighlight = ReadonlyMap<DiffLine, readonly ThemedToken[]>;

/**
 * Most lines that one call of the highlighter colors before it lets the page take input again.
 */
const HIGHLIGHT_CHUNK = 100;

/**
 * Resolves once a timer of `clock` without delay ran, so that the tasks that wait, such as the input of the user, run
 * first.
 */
const nextTask = async (clock: Clock): Promise<void> =>
  new Promise((resolve) => {
    clock.after(0, resolve);
  });

/**
 * Colors the lines `lines` of one side of a hunk as one piece of code with `highlighter`, so that a construct that
 * spans lines, such as a block comment, colors each of its lines, and adds the colors of each line to `colors`. It
 * colors `HIGHLIGHT_CHUNK` lines at a time, each chunk read on from where the chunk before it ended, and waits for a
 * timer of `clock` between two chunks.
 */
const colorSide = async (
  highlighter: LanguageHighlighter,
  clock: Clock,
  lines: readonly DiffLine[],
  colors: Map<DiffLine, readonly ThemedToken[]>,
): Promise<void> => {
  let state: GrammarState | undefined;
  for (let start = 0; start < lines.length; start += HIGHLIGHT_CHUNK) {
    if (start > 0) await nextTask(clock);
    const chunk = lines.slice(start, start + HIGHLIGHT_CHUNK);
    const colored = highlighter.tokenizeFrom(chunk.map((line) => line.text).join('\n'), state);
    // A line that holds a line break of its own splits in two, so its colors would land on the lines below it.
    if (colored.tokens.length !== chunk.length) return;
    for (const [index, line] of chunk.entries()) {
      colors.set(line, colored.tokens[index] ?? []);
    }
    state = colored.state;
  }
};

/**
 * Colors the old and then the new side of the hunk `hunk` with `highlighter`, so that a line both sides share keeps
 * the colors of its new side, and adds the colors of each line to `colors`.
 */
const colorHunk = async (
  highlighter: LanguageHighlighter,
  clock: Clock,
  hunk: DiffHunk,
  colors: Map<DiffLine, readonly ThemedToken[]>,
): Promise<void> => {
  await colorSide(
    highlighter,
    clock,
    hunk.lines.filter((line) => line.kind !== 'add'),
    colors,
  );
  await nextTask(clock);
  await colorSide(
    highlighter,
    clock,
    hunk.lines.filter((line) => line.kind !== 'delete'),
    colors,
  );
};

/**
 * Returns the colors of the lines of the file `file` with `highlighter`, each hunk colored on its own, and waits for a
 * timer of `clock` between two hunks, so that the page takes input while a big file colors.
 */
export const colorFile = async (
  file: FileDiff,
  highlighter: LanguageHighlighter,
  clock: Clock,
): Promise<FileHighlight> => {
  const colors = new Map<DiffLine, readonly ThemedToken[]>();
  for (const hunk of file.hunks) {
    await colorHunk(highlighter, clock, hunk, colors);
    await nextTask(clock);
  }
  return colors;
};
