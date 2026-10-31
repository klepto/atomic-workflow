import { memo, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { chunksOf, type DiffChunk } from '@/review/diff-chunks.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { FileDiff } from '@/review/patch.ts';
import { SplitBody } from '@/review/split-body.tsx';
import { UnifiedBody } from '@/review/unified-body.tsx';
import type { DiffLayout } from '@/review/use-diff-layout.ts';
import { type FileHighlight, useFileHighlight } from '@/review/use-file-highlight.ts';
import { useProgressiveLimit } from '@/review/use-progressive-limit.ts';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * Props of `DiffBody`.
 */
interface DiffBodyProps {
  /**
   * Changes of the file.
   */
  readonly file: FileDiff;

  /**
   * Layout of the lines.
   */
  readonly layout: DiffLayout;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Props of `ChunkBody`.
 */
interface ChunkBodyProps {
  /**
   * Lines of the chunk.
   */
  readonly chunk: DiffChunk;

  /**
   * Colors of the lines of the file, or `undefined` while they load.
   */
  readonly highlight: FileHighlight | undefined;

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Most lines of a file that show at first, and that each click on the button that shows more adds. A multiple of
 * `RENDER_STEP`.
 */
const PAGE_LINES = 2000;

/**
 * Lines of a chunk, which renders in one step, so that no step holds up the page for longer than a frame.
 */
const RENDER_STEP = 100;

/**
 * Lines of one chunk in the layout of the chunk. It renders again only when one of its props changes, so a step of
 * the render renders only its new chunk.
 */
const ChunkBody = memo(({ chunk, highlight, review }: ChunkBodyProps) =>
  chunk.layout === 'unified' ? (
    <UnifiedBody pieces={chunk.pieces} highlight={highlight} review={review} />
  ) : (
    <SplitBody pieces={chunk.pieces} highlight={highlight} review={review} />
  ),
);

/**
 * Lines of the file `file` in the layout `layout`, with the comments of `review` on them, and its code in colors once
 * they loaded. The first `PAGE_LINES` lines show, in chunks of `RENDER_STEP` lines across frames so that the page keeps
 * taking input, and a button below them shows the next `PAGE_LINES`. The line buttons get one `onSelectLine` for the
 * life of the body, so they do not render again each time `review` changes.
 */
export const DiffBody = ({ file, layout, review }: DiffBodyProps) => {
  const highlight = useFileHighlight(file);
  const onSelectLine = useStableCallback(review.onSelectLine);
  const stableReview = useMemo(() => ({ ...review, onSelectLine }), [review, onSelectLine]);
  const chunks = useMemo(() => chunksOf(file, layout, RENDER_STEP), [file, layout]);
  const total = chunks.reduce((count, chunk) => count + chunk.size, 0);
  const [page, setPage] = useState(PAGE_LINES);
  const target = Math.min(total, page);
  const shown = useProgressiveLimit(Math.ceil(target / RENDER_STEP), 1);
  const hidden = total - target;
  return (
    <>
      {chunks.slice(0, shown).map((chunk, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the chunks of a file have no identity besides their place.
        <ChunkBody key={index} chunk={chunk} highlight={highlight} review={stableReview} />
      ))}
      {hidden > 0 && shown * RENDER_STEP >= target && (
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 font-sans text-sm">
          <p className="min-w-0 flex-1 text-muted-foreground">
            {`${hidden.toLocaleString('en-US')} more lines of the file are not shown.`}
          </p>
          <Button variant="outline" size="sm" onClick={() => setPage((current) => current + PAGE_LINES)}>
            {`Show ${Math.min(hidden, PAGE_LINES).toLocaleString('en-US')} more lines`}
          </Button>
        </div>
      )}
    </>
  );
};
