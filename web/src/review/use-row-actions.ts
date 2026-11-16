import { useMemo } from 'react';
import type { FileReview, ThreadActions } from '@/review/file-review.ts';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * Functions of the review that the rows of a body call: the selection of a line, and the changes of the comments.
 */
export interface RowActions extends ThreadActions {
  /**
   * Selects a line to comment on, or extends the selection to it.
   */
  readonly onSelectLine: FileReview['onSelectLine'];
}

/**
 * Returns the functions of `review` that the rows of a body call, the same object for the life of the body, each
 * calling the function of the latest `review`. So a row does not render again only since `review` changed.
 */
export const useRowActions = (review: FileReview): RowActions => {
  const onSelectLine = useStableCallback(review.onSelectLine);
  const onAdd = useStableCallback(review.onAdd);
  const onCancel = useStableCallback(review.onCancel);
  const onEdit = useStableCallback(review.onEdit);
  const onSave = useStableCallback(review.onSave);
  const onDelete = useStableCallback(review.onDelete);
  return useMemo(
    () => ({ onSelectLine, onAdd, onCancel, onEdit, onSave, onDelete }),
    [onSelectLine, onAdd, onCancel, onEdit, onSave, onDelete],
  );
};
