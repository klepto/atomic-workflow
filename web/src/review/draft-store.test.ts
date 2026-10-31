import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { readDraft, writeDraft } from '@/review/draft-store.ts';
import type { ReviewDraft } from '@/review/review-draft.ts';

/**
 * Entries of the fake local storage, which each test starts empty.
 */
const entries = new Map<string, string>();

// The adapter of the browser store reads `window.localStorage`, which Node.js lacks, so a plain object over `entries`
// stands in for it.
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string): string | null => entries.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        entries.set(key, value);
      },
      removeItem: (key: string): void => {
        entries.delete(key);
      },
    },
  },
});

after(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

beforeEach(() => {
  entries.clear();
});

/**
 * Key of the entry that holds the review of the ticket 2 of the task 1.
 */
const KEY = 'atomic-workflow:review:1:2';

/**
 * Review with one comment on the whole file `a.ts` and an overall comment.
 */
const DRAFT: ReviewDraft = {
  comments: [{ id: '1', path: 'a.ts', anchor: { kind: 'file' }, body: 'Fix' }],
  overall: 'Good',
};

describe('readDraft', () => {
  it('returns the review that the store holds for the ticket', () => {
    entries.set(KEY, JSON.stringify(DRAFT));
    assert.deepEqual(readDraft(1, 2), DRAFT);
  });

  it('returns an empty review when the store holds none for the ticket', () => {
    entries.set('atomic-workflow:review:1:3', JSON.stringify(DRAFT));
    assert.deepEqual(readDraft(1, 2), { comments: [], overall: '' });
  });

  it('returns an empty review when the entry is not JSON', () => {
    entries.set(KEY, '{');
    assert.deepEqual(readDraft(1, 2), { comments: [], overall: '' });
  });

  it('returns an empty review when the entry is not an object', () => {
    entries.set(KEY, '3');
    assert.deepEqual(readDraft(1, 2), { comments: [], overall: '' });
  });

  it('reads a field of the wrong type as empty and keeps the other one', () => {
    entries.set(KEY, JSON.stringify({ comments: 'none', overall: 'Good' }));
    assert.deepEqual(readDraft(1, 2), { comments: [], overall: 'Good' });
  });
});

describe('writeDraft', () => {
  it('keeps the review of the ticket in the store as JSON', () => {
    writeDraft(1, 2, DRAFT);
    assert.deepEqual(JSON.parse(entries.get(KEY) ?? ''), DRAFT);
  });

  it('removes the entry of the ticket for a review with no comment', () => {
    entries.set(KEY, JSON.stringify(DRAFT));
    writeDraft(1, 2, { comments: [], overall: ' ' });
    assert.equal(entries.has(KEY), false);
  });
});
