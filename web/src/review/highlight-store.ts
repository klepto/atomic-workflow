import type { ThemedToken } from 'shiki/core';
import type { Clock } from '@/lib/clock.ts';
import { languageOfPath } from '@/lib/code-highlight.ts';
import type { FileColorer } from '@/review/file-colorer.ts';
import { addBatch, type FileHighlight, hunkSidesOf } from '@/review/file-highlight.ts';
import type { DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Store of the colors of the files of the page, which colors each file once, on its first subscriber, and keeps its
 * colors for the life of the page.
 */
export interface HighlightStore {
  /**
   * Returns the colors of the file `file` so far, or `undefined` before its first batch, and for a file that gets no
   * colors.
   */
  get(file: FileDiff): FileHighlight | undefined;

  /**
   * Calls `listener` each time the colors of the file `file` change, and starts to color the file when it has not
   * started yet. Returns the function that stops the calls.
   */
  subscribe(file: FileDiff, listener: () => void): () => void;
}

/**
 * Adapters that a highlight store needs.
 */
export interface HighlightStoreDependencies {
  /**
   * Colorer of the code of the files.
   */
  readonly colorer: FileColorer;

  /**
   * Clock of the timers that hold the batches together.
   */
  readonly clock: Clock;
}

/**
 * Coloring of one file.
 */
interface Coloring {
  /**
   * Colors of the lines colored so far.
   */
  readonly colors: Map<DiffLine, readonly ThemedToken[]>;

  /**
   * Colors that the subscribers see, or `undefined` before the first batch.
   */
  shown: FileHighlight | undefined;

  /**
   * Subscribers to the colors.
   */
  readonly listeners: Set<() => void>;

  /**
   * Whether a timer waits to show the colors.
   */
  waiting: boolean;

  /**
   * Time the colors showed last, in ms since the epoch.
   */
  shownAt: number;
}

/**
 * Shortest time between two changes of the colors of one file, in ms, so that a big file does not render its rows
 * again on every batch.
 */
const BATCH_INTERVAL = 100;

/**
 * Returns a store that colors each file with the colorer of `dependencies`, and shows its colors at most once each
 * `BATCH_INTERVAL` ms per file, by the clock of `dependencies`.
 */
export const createHighlightStore = (dependencies: HighlightStoreDependencies): HighlightStore => {
  const { colorer, clock } = dependencies;
  const colorings = new WeakMap<FileDiff, Coloring>();

  /**
   * Shows the colors of `coloring` so far as a new object, and tells its subscribers.
   */
  const show = (coloring: Coloring): void => {
    coloring.waiting = false;
    coloring.shownAt = clock.now();
    coloring.shown = new Map(coloring.colors);
    for (const listener of [...coloring.listeners]) listener();
  };

  /**
   * Starts to color the file `file`, and returns its coloring.
   */
  const start = (file: FileDiff): Coloring => {
    const coloring: Coloring = {
      colors: new Map(),
      shown: undefined,
      listeners: new Set(),
      waiting: false,
      shownAt: Number.NEGATIVE_INFINITY,
    };
    colorings.set(file, coloring);
    if (languageOfPath(file.path) === undefined) return coloring;
    const sides = hunkSidesOf(file);
    colorer.color(
      file.path,
      sides.map((side) => side.map((line) => line.text)),
      (batch) => {
        addBatch(coloring.colors, sides, batch);
        if (coloring.waiting) return;
        coloring.waiting = true;
        clock.after(Math.max(0, coloring.shownAt + BATCH_INTERVAL - clock.now()), () => show(coloring));
      },
    );
    return coloring;
  };

  return {
    get: (file) => colorings.get(file)?.shown,
    subscribe: (file, listener) => {
      const coloring = colorings.get(file) ?? start(file);
      coloring.listeners.add(listener);
      return () => {
        coloring.listeners.delete(listener);
      };
    },
  };
};
