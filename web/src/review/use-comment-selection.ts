import { useState } from 'react';
import type { CommentAnchor } from '@/review/comment-anchor.ts';
import { cryptoNewCommentId } from '@/review/comment-id.crypto.ts';
import type { FileReview } from '@/review/file-review.ts';
import type { DiffSide } from '@/review/patch.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';
import type { UpdateDraftFunction } from '@/review/use-review-draft.ts';

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
 * Returns the selection and the edit of the comments of the review `draft`, which `update` changes. A selection of a
 * whole file calls `onShowFile` with the path of the file, so that a folded file shows.
 */
export const useCommentSelection = (
  draft: ReviewDraft,
  update: UpdateDraftFunction,
  onShowFile: (path: string) => void,
): CommentSelection => {
  const [selection, setSelection] = useState<Selection>();
  const [editing, setEditing] = useState<string>();

  /**
   * Clears the selection, and ends the edit of a comment.
   */
  const clear = (): void => {
    setSelection(undefined);
    setEditing(undefined);
  };

  /**
   * Returns the comments of `draft` and the selection on the file `path`, with the functions that change them.
   */
  const reviewOf = (path: string): FileReview => ({
    comments: draft.comments.filter((comment) => comment.path === path),
    selection: selection?.path === path ? selection.anchor : undefined,
    editing,
    onSelectLine: (side, number, extend) => {
      setEditing(undefined);
      setSelection((current) => selectLine(current, path, side, number, extend));
    },
    onSelectFile: () => {
      setEditing(undefined);
      onShowFile(path);
      setSelection({ path, origin: null, anchor: { kind: 'file' } });
    },
    onAdd: (body) => {
      if (selection === undefined) return;
      const comment = { id: cryptoNewCommentId(), path, anchor: selection.anchor, body };
      update((current) => ({ ...current, comments: [...current.comments, comment] }));
      setSelection(undefined);
    },
    onCancel: clear,
    onEdit: (id) => {
      setSelection(undefined);
      setEditing(id);
    },
    onSave: (id, body) => {
      update((current) => ({
        ...current,
        comments: current.comments.map((comment) => (comment.id === id ? { ...comment, body } : comment)),
      }));
      setEditing(undefined);
    },
    onDelete: (id) =>
      update((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== id) })),
  });

  return { reviewOf, clear };
};
