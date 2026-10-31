import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommentAnchor } from '@/review/comment-anchor.ts';
import type { FileReview } from '@/review/file-review.ts';
import { codeTint, markOf, numberTint } from '@/review/line-mark.ts';
import type { DiffLine } from '@/review/patch.ts';

/**
 * Returns a line of a hunk of the kind `kind` with the new number `newNumber`.
 */
const line = (kind: DiffLine['kind'], newNumber: number | null = null): DiffLine => ({
  kind,
  oldNumber: null,
  newNumber,
  text: '',
  noNewline: false,
});

/**
 * Returns the anchor of the new lines `start` to `end`.
 */
const lines = (start: number, end: number): CommentAnchor => ({ kind: 'lines', side: 'new', start, end });

/**
 * Returns a review of a file with the fields that a test states, and functions that do nothing.
 */
const review = (fields: Partial<FileReview>): FileReview => ({
  comments: [],
  selection: undefined,
  editing: undefined,
  onSelectLine: () => undefined,
  onSelectFile: () => undefined,
  onAdd: () => undefined,
  onCancel: () => undefined,
  onEdit: () => undefined,
  onSave: () => undefined,
  onDelete: () => undefined,
  ...fields,
});

describe('markOf', () => {
  it('marks a line that the selection covers as selected, even with a comment on it', () => {
    const comments = [{ id: '1', path: 'a.ts', anchor: lines(2, 2), body: 'Fix' }];
    assert.equal(markOf(line('add', 2), review({ selection: lines(1, 3), comments })), 'selected');
  });

  it('marks a line that a comment covers as commented', () => {
    const comments = [{ id: '1', path: 'a.ts', anchor: lines(2, 2), body: 'Fix' }];
    assert.equal(markOf(line('add', 2), review({ selection: lines(5, 5), comments })), 'commented');
  });

  it('marks a line that nothing covers as plain', () => {
    assert.equal(markOf(line('add', 2), review({})), 'plain');
  });
});

describe('codeTint', () => {
  it('tints a selected line by the selection, whatever its kind', () => {
    assert.equal(codeTint(line('add'), 'selected'), 'bg-primary/12');
  });

  it('tints an added, a deleted and a shared line by their kind', () => {
    assert.deepEqual(
      [codeTint(line('add'), 'plain'), codeTint(line('delete'), 'commented'), codeTint(line('context'), 'plain')],
      ['bg-diff-add/12', 'bg-diff-delete/12', ''],
    );
  });
});

describe('numberTint', () => {
  it('tints the number of a selected line by the selection, whatever its kind', () => {
    assert.equal(numberTint(line('delete'), 'selected'), 'bg-primary/20 text-foreground');
  });

  it('tints the number of an added, a deleted and a shared line by their kind', () => {
    assert.deepEqual(
      [numberTint(line('add'), 'plain'), numberTint(line('delete'), 'commented'), numberTint(line('context'), 'plain')],
      ['bg-diff-add/20', 'bg-diff-delete/20', ''],
    );
  });
});
