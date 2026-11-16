import type { GrammarState, ThemedToken } from 'shiki/core';
import type { LanguageHighlighter } from '@/lib/code-highlight.ts';
import type { DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Colored pieces of the text of each line of a file, by the line of the diff that holds the text. A line without an
 * entry shows its text without colors.
 */
export type FileHighlight = ReadonlyMap<DiffLine, readonly ThemedToken[]>;

/**
 * Lines of one side of a hunk, which color as one piece of code, so that a construct that spans lines, such as a block
 * comment, colors each of its lines.
 */
export type HunkSide = readonly DiffLine[];

/**
 * Colors of a run of lines of one side of a hunk.
 */
export interface ColorBatch {
  /**
   * Index of the side in the sides of `hunkSidesOf`.
   */
  readonly side: number;

  /**
   * Index of the first line of the run in its side.
   */
  readonly start: number;

  /**
   * Colored pieces of each line of the run, one array per line.
   */
  readonly tokens: readonly (readonly ThemedToken[])[];
}

/**
 * Most lines of one batch of colors, so that the page takes each batch in a short task.
 */
const BATCH_LINES = 200;

/**
 * Returns the sides of each hunk of the file `file` that hold lines: the old side and then the new side of each hunk,
 * so that a line both sides share keeps the colors of its new side.
 */
export const hunkSidesOf = (file: FileDiff): readonly HunkSide[] =>
  file.hunks
    .flatMap((hunk) => [
      hunk.lines.filter((line) => line.kind !== 'add'),
      hunk.lines.filter((line) => line.kind !== 'delete'),
    ])
    .filter((side) => side.length > 0);

/**
 * Colors each side of `sides`, each a list of the texts of its lines, with `highlighter`, and sends the colors of each
 * run of up to `BATCH_LINES` lines to `send`, in order. Each run reads on from where the run before it ended. A side
 * where a line holds a line break of its own stops at that run, since its colors would land on the lines below it.
 */
export const colorSides = (
  highlighter: LanguageHighlighter,
  sides: readonly (readonly string[])[],
  send: (batch: ColorBatch) => void,
): void => {
  for (const [side, texts] of sides.entries()) {
    let state: GrammarState | undefined;
    for (let start = 0; start < texts.length; start += BATCH_LINES) {
      const run = texts.slice(start, start + BATCH_LINES);
      const colored = highlighter.tokenizeFrom(run.join('\n'), state);
      if (colored.tokens.length !== run.length) break;
      send({ side, start, tokens: colored.tokens });
      state = colored.state;
    }
  }
};

/**
 * Adds the colors of the batch `batch` to `colors`, for the lines of `sides` that it colors.
 */
export const addBatch = (
  colors: Map<DiffLine, readonly ThemedToken[]>,
  sides: readonly HunkSide[],
  batch: ColorBatch,
): void => {
  const lines = sides[batch.side];
  if (lines === undefined) return;
  for (const [index, tokens] of batch.tokens.entries()) {
    const line = lines[batch.start + index];
    if (line !== undefined) colors.set(line, tokens);
  }
};
