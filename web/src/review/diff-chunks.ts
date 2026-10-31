import type { DiffLine, FileDiff } from '@/review/patch.ts';
import { type SplitRow, splitRowsOf } from '@/review/split-rows.ts';
import type { DiffLayout } from '@/review/use-diff-layout.ts';

/**
 * Run of the lines of one hunk in the unified view, with the header of the hunk when the run starts the hunk.
 */
export interface UnifiedPiece {
  /**
   * Header line of the hunk when the run starts it, or `null` for a run that goes on from the run before it.
   */
  readonly header: string | null;

  /**
   * Lines of the run, in their order.
   */
  readonly lines: readonly DiffLine[];
}

/**
 * Run of the rows of one hunk in the split view, with the header of the hunk when the run starts the hunk.
 */
export interface SplitPiece {
  /**
   * Header line of the hunk when the run starts it, or `null` for a run that goes on from the run before it.
   */
  readonly header: string | null;

  /**
   * Rows of the run, in their order.
   */
  readonly rows: readonly SplitRow[];
}

/**
 * Part of the lines of a file that renders in one step: runs of the unified view or of the split view, with the
 * number of their lines or rows.
 */
export type DiffChunk =
  | { readonly layout: 'unified'; readonly pieces: readonly UnifiedPiece[]; readonly size: number }
  | { readonly layout: 'split'; readonly pieces: readonly SplitPiece[]; readonly size: number };

/**
 * Run of the items of one hunk, with the header of the hunk when the run starts it.
 */
interface Piece<Item> {
  /**
   * Header line of the hunk when the run starts it, or `null`.
   */
  readonly header: string | null;

  /**
   * Items of the run.
   */
  readonly items: readonly Item[];
}

/**
 * Returns the items of each hunk of `hunks` in chunks of `step` items, each chunk as the runs of the hunks that it
 * holds.
 */
const chunkItems = <Item>(
  hunks: readonly { readonly header: string; readonly items: readonly Item[] }[],
  step: number,
): Piece<Item>[][] => {
  const chunks: Piece<Item>[][] = [];
  let chunk: Piece<Item>[] = [];
  let size = 0;
  for (const hunk of hunks) {
    // A hunk without lines still shows its header.
    if (hunk.items.length === 0) chunk.push({ header: hunk.header, items: [] });
    for (let start = 0; start < hunk.items.length; ) {
      const items = hunk.items.slice(start, start + step - size);
      chunk.push({ header: start === 0 ? hunk.header : null, items });
      start += items.length;
      size += items.length;
      if (size === step) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
    }
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
};

/**
 * Returns the lines of the file `file` in the layout `layout` as chunks of `step` lines of the unified view or rows of
 * the split view, in their order. The rows of the split view pair the lines of each hunk as a whole, so a chunk never
 * splits a pair.
 */
export const chunksOf = (file: FileDiff, layout: DiffLayout, step: number): readonly DiffChunk[] => {
  if (layout === 'unified') {
    const hunks = file.hunks.map((hunk) => ({ header: hunk.header, items: hunk.lines }));
    return chunkItems(hunks, step).map((pieces) => ({
      layout,
      pieces: pieces.map(({ header, items }) => ({ header, lines: items })),
      size: pieces.reduce((count, piece) => count + piece.items.length, 0),
    }));
  }
  const hunks = file.hunks.map((hunk) => ({ header: hunk.header, items: splitRowsOf(hunk.lines) }));
  return chunkItems(hunks, step).map((pieces) => ({
    layout,
    pieces: pieces.map(({ header, items }) => ({ header, rows: items })),
    size: pieces.reduce((count, piece) => count + piece.items.length, 0),
  }));
};
