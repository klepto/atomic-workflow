import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { ChunkSlot, RENDER_MARGIN } from '@/review/chunk-slot.tsx';
import { chunkHolds, chunksOf, type DiffChunk, estimatedHeightOf } from '@/review/diff-chunks.ts';
import type { FileReview } from '@/review/file-review.ts';
import { observeNearScreen } from '@/review/near-screen.ts';
import type { FileDiff } from '@/review/patch.ts';
import type { DiffLayout } from '@/review/use-diff-layout.ts';
import { useFileHighlight } from '@/review/use-file-highlight.ts';
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
 * Props of `WindowedChunks`.
 */
interface WindowedChunksProps {
  /**
   * Changes of the file.
   */
  readonly file: FileDiff;

  /**
   * Chunks of the lines of the file to show.
   */
  readonly chunks: readonly DiffChunk[];

  /**
   * Comments of the review on the file, with the selection in it.
   */
  readonly review: FileReview;
}

/**
 * Most lines of a file that show at first, and that each click on the button that shows more adds. A multiple of
 * `CHUNK_LINES`.
 */
const PAGE_LINES = 2000;

/**
 * Lines of a chunk, which renders as a whole once it comes near the screen.
 */
const CHUNK_LINES = 50;

/**
 * Chunks `chunks` of the lines of the file `file`, each rendered only while it is near the screen, with the comments
 * of `review` on them, and the code in colors once they loaded. A chunk that holds the selection or a comment being
 * edited stays rendered off screen, so that what the reviewer types is kept. The line buttons get one `onSelectLine`
 * for the life of the body, so they do not render again each time `review` changes.
 */
const WindowedChunks = ({ file, chunks, review }: WindowedChunksProps) => {
  const highlight = useFileHighlight(file);
  const onSelectLine = useStableCallback(review.onSelectLine);
  const stableReview = useMemo(() => ({ ...review, onSelectLine }), [review, onSelectLine]);
  const { selection } = review;
  const editing = review.comments.find((comment) => comment.id === review.editing)?.anchor;
  const pinned = useMemo(
    () =>
      chunks.map(
        (chunk) =>
          (selection !== undefined && chunkHolds(chunk, selection)) ||
          (editing !== undefined && chunkHolds(chunk, editing)),
      ),
    [chunks, selection, editing],
  );
  return chunks.map((chunk, index) => (
    <ChunkSlot
      // biome-ignore lint/suspicious/noArrayIndexKey: the chunks of a file have no identity besides their place.
      key={index}
      chunk={chunk}
      highlight={highlight}
      review={stableReview}
      pinned={pinned[index] ?? false}
    />
  ));
};

/**
 * Lines of the file `file` in the layout `layout`, with the comments of `review` on them, and its code in colors once
 * they loaded. The first `PAGE_LINES` lines show, and a button below them shows the next `PAGE_LINES`. The lines render
 * in chunks of `CHUNK_LINES` lines, each only while it is near the screen, and an empty box of the height of its lines
 * holds the place of each other chunk. Until the file comes near the screen, one empty box holds the place of all its
 * lines, and its colors do not load.
 */
export const DiffBody = ({ file, layout, review }: DiffBodyProps) => {
  const chunks = useMemo(() => chunksOf(file, layout, CHUNK_LINES), [file, layout]);
  const total = chunks.reduce((count, chunk) => count + chunk.size, 0);
  const [page, setPage] = useState(PAGE_LINES);
  const target = Math.min(total, page);
  const shown = useMemo(() => chunks.slice(0, Math.ceil(target / CHUNK_LINES)), [chunks, target]);
  const hidden = total - target;
  const placeholder = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = placeholder.current;
    if (seen || element === null) return undefined;
    return observeNearScreen(element, RENDER_MARGIN, (near) => {
      if (near) startTransition(() => setSeen(true));
    });
  }, [seen]);

  return (
    <>
      {seen ? (
        <WindowedChunks file={file} chunks={shown} review={review} />
      ) : (
        <div ref={placeholder} style={{ height: shown.reduce((sum, chunk) => sum + estimatedHeightOf(chunk), 0) }} />
      )}
      {hidden > 0 && (
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
