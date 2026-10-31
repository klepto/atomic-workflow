import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { cryptoNewCommentId } from '@/review/comment-id.crypto.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';
import { type Selection, selectLine } from '@/review/select-line.ts';
import type { UpdateDraftFunction } from '@/review/use-review-draft.ts';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * Selection and edit of the comments of a review, by file.
 */
interface CommentSelection {
  /**
   * Returns the comments of the review and the selection on the file `path`, with the functions that change them.
   */
  readonly reviewOf: (path: string) => FileReview;

  /**
   * Clears the selection, and ends the edit of a comment.
   */
  readonly clear: () => void;
}

/**
 * Returns whether the lists `first` and `second` hold the same items in the same order.
 */
const sameItems = <Item>(first: readonly Item[], second: readonly Item[]): boolean =>
  first.length === second.length && first.every((item, index) => item === second[index]);

/**
 * Returns the selection and the edit of the comments of the review `draft`, which `update` changes. A selection of a
 * whole file calls `onShowFile` with the path of the file, so that a folded file shows. The comments of a file stay
 * the same object while its comments, its selection and its edit stay the same, so that a file does not render again
 * when the review changes elsewhere, such as in the overall comment.
 */
export const useCommentSelection = (
  draft: ReviewDraft,
  update: UpdateDraftFunction,
  onShowFile: (path: string) => void,
): CommentSelection => {
  const [selection, setSelection] = useState<Selection>();
  const [editing, setEditing] = useState<string>();
  const latestSelection = useRef(selection);
  useLayoutEffect(() => {
    latestSelection.current = selection;
  });
  const showFile = useStableCallback(onShowFile);
  const reviews = useRef(new Map<string, FileReview>());

  /**
   * Clears the selection, and ends the edit of a comment.
   */
  const clear = useCallback((): void => {
    setSelection(undefined);
    setEditing(undefined);
  }, []);

  /**
   * Returns the comments of `draft` and the selection on the file `path`, with the functions that change them: the
   * same object as the last call for `path` while they did not change.
   */
  const reviewOf = (path: string): FileReview => {
    const comments = draft.comments.filter((comment) => comment.path === path);
    const anchor = selection?.path === path ? selection.anchor : undefined;
    const fileEditing = comments.some((comment) => comment.id === editing) ? editing : undefined;
    const known = reviews.current.get(path);
    if (
      known !== undefined &&
      known.selection === anchor &&
      known.editing === fileEditing &&
      sameItems(known.comments, comments)
    ) {
      return known;
    }
    const review: FileReview = {
      comments,
      selection: anchor,
      editing: fileEditing,
      onSelectLine: (side, number, extend) => {
        setEditing(undefined);
        setSelection((current) => selectLine(current, path, side, number, extend));
      },
      onSelectFile: () => {
        setEditing(undefined);
        showFile(path);
        setSelection({ path, origin: null, anchor: { kind: 'file' } });
      },
      onAdd: (body) => {
        const current = latestSelection.current;
        if (current === undefined) return;
        const comment = { id: cryptoNewCommentId(), path, anchor: current.anchor, body };
        update((draft) => ({ ...draft, comments: [...draft.comments, comment] }));
        setSelection(undefined);
      },
      onCancel: clear,
      onEdit: (id) => {
        setSelection(undefined);
        setEditing(id);
      },
      onSave: (id, body) => {
        update((draft) => ({
          ...draft,
          comments: draft.comments.map((comment) => (comment.id === id ? { ...comment, body } : comment)),
        }));
        setEditing(undefined);
      },
      onDelete: (id) =>
        update((draft) => ({ ...draft, comments: draft.comments.filter((comment) => comment.id !== id) })),
    };
    reviews.current.set(path, review);
    return review;
  };

  return { reviewOf, clear };
};
