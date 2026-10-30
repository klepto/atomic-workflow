import type { FileReview } from '@/review/file-review.ts';
import type { FileDiff } from '@/review/patch.ts';
import { SplitBody } from '@/review/split-body.tsx';
import { UnifiedBody } from '@/review/unified-body.tsx';
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
 * Lines of the file `file` in the layout `layout`, with the comments of `review` on them, and its code in colors once
 * they loaded. The line buttons get one `onSelectLine` for the life of the body, so they do not render again each time
 * `review` changes.
 */
export const DiffBody = ({ file, layout, review }: DiffBodyProps) => {
  const highlight = useFileHighlight(file);
  const onSelectLine = useStableCallback(review.onSelectLine);
  const stableReview = { ...review, onSelectLine };
  return layout === 'unified' ? (
    <UnifiedBody file={file} highlight={highlight} review={stableReview} />
  ) : (
    <SplitBody file={file} highlight={highlight} review={stableReview} />
  );
};
