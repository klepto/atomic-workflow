import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sameProps } from '@/review/same-props.ts';

describe('sameProps', () => {
  it('accepts props whose values are the same', () => {
    const actions = { onSelect: () => undefined };
    assert.equal(sameProps({ mark: 'plain', actions }, { mark: 'plain', actions }), true);
  });

  it('rejects props with a value that changed', () => {
    assert.equal(sameProps({ mark: 'plain' }, { mark: 'selected' }), false);
  });

  it('rejects props with an object that is a new one, even with the same fields', () => {
    assert.equal(sameProps({ line: { text: 'a' } }, { line: { text: 'a' } }), false);
  });

  it('accepts a new list with the same items in the same order', () => {
    const first = { id: '1' };
    assert.equal(sameProps({ comments: [first] }, { comments: [first] }), true);
  });

  it('rejects a list with other items', () => {
    assert.equal(sameProps({ comments: [{ id: '1' }] }, { comments: [{ id: '1' }] }), false);
  });

  it('rejects a list with a different length', () => {
    const first = { id: '1' };
    assert.equal(sameProps({ comments: [first] }, { comments: [first, first] }), false);
  });

  it('rejects a list in place of `undefined`', () => {
    assert.equal(sameProps<{ tokens?: number[] }>({ tokens: undefined }, { tokens: [] }), false);
  });

  it('rejects props with a key that one of them lacks', () => {
    assert.equal(sameProps<{ mark?: string; side?: string }>({ mark: 'plain' }, { side: 'old' }), false);
  });
});
