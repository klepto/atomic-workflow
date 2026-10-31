import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { errorDetail } from './error-detail.ts';

describe('errorDetail', () => {
  it('returns the stack of an Error', () => {
    const error = new Error('The server failed');
    assert.equal(errorDetail(error), error.stack);
  });

  it('returns the message of an Error without a stack', () => {
    const error = new Error('The server failed');
    error.stack = undefined;
    assert.equal(errorDetail(error), 'The server failed');
  });

  it('returns a value that is no Error as text', () => {
    assert.equal(errorDetail('The server failed'), 'The server failed');
    assert.equal(errorDetail(42), '42');
    assert.equal(errorDetail(undefined), 'undefined');
  });
});
