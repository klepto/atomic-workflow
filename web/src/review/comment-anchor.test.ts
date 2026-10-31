import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anchorWords, type CommentAnchor, coversLine, endsAt } from '@/review/comment-anchor.ts';
import type { DiffLine } from '@/review/patch.ts';

/**
 * Returns a line of a hunk with the numbers `oldNumber` and `newNumber`, of the kind that the numbers imply.
 */
const line = (oldNumber: number | null, newNumber: number | null): DiffLine => ({
  kind: oldNumber === null ? 'add' : newNumber === null ? 'delete' : 'context',
  oldNumber,
  newNumber,
  text: '',
  noNewline: false,
});

/**
 * Returns an anchor of the lines `start` to `end` of the side `side`.
 */
const lines = (side: 'old' | 'new', start: number, end: number): CommentAnchor => ({ kind: 'lines', side, start, end });

describe('coversLine', () => {
  it('covers a line whose number on the side of the anchor lies within its run', () => {
    assert.equal(coversLine(lines('new', 4, 6), line(null, 4)), true);
    assert.equal(coversLine(lines('new', 4, 6), line(null, 6)), true);
  });

  it('does not cover a line outside the run', () => {
    assert.equal(coversLine(lines('new', 4, 6), line(null, 7)), false);
  });

  it('does not cover a line that has the number only on the other side', () => {
    assert.equal(coversLine(lines('old', 4, 4), line(null, 4)), false);
  });

  it('covers a shared line by its old number on the old side', () => {
    assert.equal(coversLine(lines('old', 3, 3), line(3, 9)), true);
  });

  it('covers no line with a file anchor', () => {
    assert.equal(coversLine({ kind: 'file' }, line(1, 1)), false);
  });
});

describe('endsAt', () => {
  it('returns true when the run ends at the number of its side', () => {
    assert.equal(endsAt(lines('new', 2, 5), null, 5), true);
    assert.equal(endsAt(lines('old', 2, 5), 5, null), true);
  });

  it('returns false when the run ends elsewhere or only the other side matches', () => {
    assert.equal(endsAt(lines('new', 2, 5), null, 4), false);
    assert.equal(endsAt(lines('new', 2, 5), 5, 4), false);
  });

  it('returns false for a file anchor', () => {
    assert.equal(endsAt({ kind: 'file' }, 1, 1), false);
  });
});

describe('anchorWords', () => {
  it('names one new line', () => {
    assert.equal(anchorWords(lines('new', 4, 4)), 'line 4');
  });

  it('names a run of new lines', () => {
    assert.equal(anchorWords(lines('new', 4, 9)), 'lines 4 to 9');
  });

  it('marks the lines of the old side', () => {
    assert.equal(anchorWords(lines('old', 4, 9)), 'lines 4 to 9 (old)');
  });

  it('names the whole file for a file anchor', () => {
    assert.equal(anchorWords({ kind: 'file' }), 'the whole file');
  });
});
