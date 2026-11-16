import type { ColorBatch } from '@/review/file-highlight.ts';

/**
 * Request of the page to the coloring worker.
 */
export interface ColorRequest {
  /**
   * Identifier of the request, which each reply names.
   */
  readonly id: number;

  /**
   * Path of the file, which names its language.
   */
  readonly path: string;

  /**
   * Sides of the hunks of the file, each a list of the texts of its lines.
   */
  readonly sides: readonly (readonly string[])[];
}

/**
 * Reply of the coloring worker to a request: a batch of colors, or the end of the request, after its last batch.
 */
export type ColorReply =
  | { readonly id: number; readonly kind: 'batch'; readonly batch: ColorBatch }
  | { readonly id: number; readonly kind: 'end' };
