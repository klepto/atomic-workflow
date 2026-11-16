import type { ColorBatch } from '@/review/file-highlight.ts';

/**
 * Colorer of the code of the files of a diff, away from the main thread of the page.
 */
export interface FileColorer {
  /**
   * Colors the sides `sides` of the file at `path`, each a list of the texts of its lines, in the language of the
   * path, and calls `onBatch` with the colors of each run of lines, in order. If the colorer or the grammar fails to
   * load, never calls `onBatch`.
   */
  color(path: string, sides: readonly (readonly string[])[], onBatch: (batch: ColorBatch) => void): void;
}
