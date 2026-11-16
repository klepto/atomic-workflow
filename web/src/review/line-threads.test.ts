import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommentAnchor } from '@/review/comment-anchor.ts';
import { threadFinderOf } from '@/review/line-threads.ts';
import type { DiffSide } from '@/review/patch.ts';
import type { ReviewComment } from '@/review/review-draft.ts';

/**
 * Returns the anchor of the lines `start` to `end` of the side `side`.
 */
const lines = (side: DiffSide, start: number, end: number): CommentAnchor => ({ kind: 'lines', side, start, end });

/**
 * Returns a comment with the identifier `id` on the anchor `anchor`.
 */
const comment = (id: string, anchor: CommentAnchor): ReviewComment => ({ id, path: 'a.ts', anchor, body: id });

describe('threadFinderOf', () => {
  it('finds the comments that end at a new line by its new number', () => {
    const first = comment('1', lines('new', 2, 4));
    const threadAt = threadFinderOf({ comments: [first], selection: undefined, editing: undefined });
    assert.deepEqual(threadAt(3, 4).comments, [first]);
  });

  it('finds the comments that end at an old line by its old number', () => {
    const first = comment('1', lines('old', 7, 7));
    const threadAt = threadFinderOf({ comments: [first], selection: undefined, editing: undefined });
    assert.deepEqual(threadAt(7, null).comments, [first]);
  });

  it('finds no comment at a line that a comment covers but does not end at', () => {
    const threadAt = threadFinderOf({
      comments: [comment('1', lines('new', 2, 4))],
      selection: undefined,
      editing: undefined,
    });
    assert.deepEqual(threadAt(null, 3).comments, []);
  });

  it('finds no comment at the number of the other side', () => {
    const threadAt = threadFinderOf({
      comments: [comment('1', lines('old', 4, 4))],
      selection: undefined,
      editing: undefined,
    });
    assert.deepEqual(threadAt(null, 4).comments, []);
  });

  it('skips the comments on the whole file', () => {
    const threadAt = threadFinderOf({
      comments: [comment('1', { kind: 'file' })],
      selection: undefined,
      editing: undefined,
    });
    assert.deepEqual(threadAt(1, 1).comments, []);
  });

  it('keeps the order in which the comments were added', () => {
    const first = comment('1', lines('new', 1, 5));
    const second = comment('2', lines('new', 5, 5));
    const threadAt = threadFinderOf({ comments: [first, second], selection: undefined, editing: undefined });
    assert.deepEqual(threadAt(null, 5).comments, [first, second]);
  });

  it('keeps the order in which the comments were added across the two sides of a line', () => {
    const first = comment('1', lines('new', 6, 6));
    const second = comment('2', lines('old', 4, 4));
    const third = comment('3', lines('new', 2, 6));
    const threadAt = threadFinderOf({ comments: [first, second, third], selection: undefined, editing: undefined });
    assert.deepEqual(threadAt(4, 6).comments, [first, second, third]);
  });

  it('returns the same empty list for every line without a comment', () => {
    const threadAt = threadFinderOf({ comments: [], selection: undefined, editing: undefined });
    assert.equal(threadAt(1, 1).comments, threadAt(2, 2).comments);
  });

  it('holds the selection at the line it ends at', () => {
    const selection = lines('new', 3, 5);
    const threadAt = threadFinderOf({ comments: [], selection, editing: undefined });
    assert.equal(threadAt(null, 5).selection, selection);
  });

  it('holds no selection at a line that the selection does not end at', () => {
    const threadAt = threadFinderOf({ comments: [], selection: lines('new', 3, 5), editing: undefined });
    assert.equal(threadAt(null, 4).selection, undefined);
  });

  it('holds the edit at the line of the comment that the user edits', () => {
    const threadAt = threadFinderOf({
      comments: [comment('1', lines('new', 2, 2))],
      selection: undefined,
      editing: '1',
    });
    assert.equal(threadAt(null, 2).editing, '1');
  });

  it('holds no edit at a line whose comments the user does not edit', () => {
    const threadAt = threadFinderOf({
      comments: [comment('1', lines('new', 2, 2)), comment('2', lines('new', 8, 8))],
      selection: undefined,
      editing: '1',
    });
    assert.equal(threadAt(null, 8).editing, undefined);
  });
});
