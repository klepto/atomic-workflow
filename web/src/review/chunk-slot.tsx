import { memo, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type DiffChunk, estimatedHeightOf } from '@/review/diff-chunks.ts';
import type { FileHighlight } from '@/review/file-highlight.ts';
import type { FileReview } from '@/review/file-review.ts';
import { observeNearScreen } from '@/review/near-screen.ts';
import { SplitBody } from '@/review/split-body.tsx';
import { UnifiedBody } from '@/review/unified-body.tsx';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * Props of `ChunkSlot`.
 */
interface ChunkSlotProps {
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

  /**
   * Whether the chunk holds the selection or a comment being edited, so that it stays rendered off screen.
   */
  readonly pinned: boolean;
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
 * Height of a chunk, measured while it rendered, with the chunk that was measured.
 */
interface MeasuredHeight {
  /**
   * Chunk that was measured.
   */
  readonly chunk: DiffChunk;

  /**
   * Height of the chunk, in px.
   */
  readonly height: number;
}

/**
 * Margin around the box that scrolls within which a chunk renders: one and a half heights of the box above and below
 * it, so that a chunk renders before it scrolls into view.
 */
export const RENDER_MARGIN = '150% 0px';

/**
 * Margin around the box that scrolls beyond which a chunk stops rendering. It is wider than `RENDER_MARGIN`, so that a
 * chunk at the edge does not render and stop again while the reviewer scrolls back and forth.
 */
const KEEP_MARGIN = '400% 0px';

/**
 * Lines of one chunk in the layout of the chunk. It renders again only when one of its props changes.
 */
const ChunkBody = memo(({ chunk, highlight, review }: ChunkBodyProps) =>
  chunk.layout === 'unified' ? (
    <UnifiedBody pieces={chunk.pieces} highlight={highlight} review={review} />
  ) : (
    <SplitBody pieces={chunk.pieces} highlight={highlight} review={review} />
  ),
);

/**
 * Place of the chunk `chunk` in the body of a file: its lines in the colors of `highlight` with the comments of
 * `review`, while it is near the screen, else an empty box of their height. It renders its lines once it comes within
 * `RENDER_MARGIN` of the box that scrolls, and stops once it leaves `KEEP_MARGIN`, unless it is `pinned`. The empty box
 * takes the height that the chunk had when it last rendered, or the estimate of its height before. It renders again
 * only when one of its props changes.
 */
export const ChunkSlot = memo(({ chunk, highlight, review, pinned }: ChunkSlotProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const measured = useRef<MeasuredHeight>(undefined);
  const far = useRef(false);
  const latest = useRef({ chunk, shown, pinned });
  useLayoutEffect(() => {
    latest.current = { chunk, shown, pinned };
  });

  /**
   * Keeps the height of the chunk while it renders, then shows an empty box of that height in its place.
   */
  const hide = useStableCallback((): void => {
    const element = ref.current;
    if (element !== null && latest.current.shown) {
      measured.current = { chunk: latest.current.chunk, height: element.offsetHeight };
    }
    // A chunk whose render is still pending stops too, since it may have passed the screen before it rendered.
    startTransition(() => setShown(false));
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const stopRender = observeNearScreen(element, RENDER_MARGIN, (near) => {
      if (near) startTransition(() => setShown(true));
    });
    const stopKeep = observeNearScreen(element, KEEP_MARGIN, (near) => {
      far.current = !near;
      if (!near && !latest.current.pinned) hide();
    });
    return () => {
      stopRender();
      stopKeep();
    };
  }, [hide]);

  useEffect(() => {
    if (!pinned && far.current) hide();
  }, [pinned, hide]);

  const height = measured.current?.chunk === chunk ? measured.current.height : estimatedHeightOf(chunk);
  return (
    <div ref={ref} style={shown ? undefined : { height }}>
      {shown && <ChunkBody chunk={chunk} highlight={highlight} review={review} />}
    </div>
  );
});
