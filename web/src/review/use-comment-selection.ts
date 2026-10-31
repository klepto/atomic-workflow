import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CommentAnchor } from '@/review/comment-anchor.ts';
import { cryptoNewCommentId } from '@/review/comment-id.crypto.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { DiffSide } from '@/review/patch.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';
import type { UpdateDraftFunction } from '@/review/use-review-draft.ts';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * What the user selected to comment on: the anchor in the file `path`, and the line `origin` that a shift and a click
 * extend the selection from, or `null` for a selection of the whole file.
 */
interface Selection {
  /**
   * Path that names the file of the selection.
   */
  readonly path: string;

  /**
   * What the selection covers in the file.
   */
  readonly anchor: CommentAnchor;

  /**
   * Line that the selection started at, or `null` for the whole file.
   */
  readonly origin: number | null;
}

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
 * Returns the next selection once the user selected the line `number` of the side `side` in the file `path`, from the
 * selection `current`. With `extend`, a selection of lines of the same side of the same file grows to the line, from
 * the line it started at. Otherwise the line alone is selected.
 */
const selectLine = (
  current: Selection | undefined,
  path: string,
  side: DiffSide,
  number: number,
  extend: boolean,
): Selection => {
  if (extend && current?.path === path && current.anchor.kind === 'lines' && current.anchor.side === side) {
    const from = current.origin ?? number;
    return { ...current, anchor: { ...current.anchor, start: Math.min(from, number), end: Math.max(from, number) } };
  }
  return { path, origin: number, anchor: { kind: 'lines', side, start: number, end: number } };
};

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
