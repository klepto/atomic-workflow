import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commentCountOf, EMPTY_DRAFT, isEmptyDraft, type ReviewComment } from '@/review/review-draft.ts';

/**
 * Comment of a review on the whole file `a.ts`.
 */
const COMMENT: ReviewComment = { id: '1', path: 'a.ts', anchor: { kind: 'file' }, body: 'Fix' };

describe('EMPTY_DRAFT', () => {
  it('holds no comment and no overall comment', () => {
    assert.deepEqual(EMPTY_DRAFT, { comments: [], overall: '' });
  });
});

describe('isEmptyDraft', () => {
  it('returns true for a review with no comment and an overall comment of white space only', () => {
    assert.equal(isEmptyDraft({ comments: [], overall: ' \n ' }), true);
  });

  it('returns false for a review with a comment', () => {
    assert.equal(isEmptyDraft({ comments: [COMMENT], overall: '' }), false);
  });

  it('returns false for a review with an overall comment', () => {
    assert.equal(isEmptyDraft({ comments: [], overall: 'Good' }), false);
  });
});

describe('commentCountOf', () => {
  it('counts the comments and the overall comment as one more', () => {
    assert.equal(commentCountOf({ comments: [COMMENT, { ...COMMENT, id: '2' }], overall: 'Good' }), 3);
  });

  it('does not count an overall comment of white space only', () => {
    assert.equal(commentCountOf({ comments: [COMMENT], overall: '  ' }), 1);
  });
});
