import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { errorMessage } from '@/lib/error-message.ts';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    assert.equal(errorMessage(new TypeError('The server is not reachable')), 'The server is not reachable');
  });

  it('returns any other value as a string', () => {
    assert.equal(errorMessage('busy'), 'busy');
    assert.equal(errorMessage(42), '42');
    assert.equal(errorMessage(undefined), 'undefined');
  });
});
