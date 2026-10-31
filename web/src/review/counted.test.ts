import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { counted } from '@/review/counted.ts';

describe('counted', () => {
  it('puts the word for one after a count of 1', () => {
    assert.equal(counted(1, 'comment', 'comments'), '1 comment');
  });

  it('puts the word for many after any other count, 0 included', () => {
    assert.equal(counted(3, 'comment', 'comments'), '3 comments');
    assert.equal(counted(0, 'file', 'files'), '0 files');
  });
});
