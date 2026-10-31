import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { errorMessage } from './error-message.ts';
import { RpcError } from './rpc-error.ts';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    assert.equal(errorMessage(new Error('The disk is full')), 'The disk is full');
  });

  it('returns the message of a subclass of Error', () => {
    assert.equal(errorMessage(new RpcError(7, 'The count is too large')), 'The count is too large');
  });

  it('returns a string as it is', () => {
    assert.equal(errorMessage('The disk is full'), 'The disk is full');
  });

  it('returns any other value as text', () => {
    assert.equal(errorMessage(42), '42');
  });
});
