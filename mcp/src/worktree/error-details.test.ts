import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { errorCode, errorMessage } from './error-details.ts';

describe('errorCode', () => {
  it('returns the code of an error of Node.js or the exit code of a child process', () => {
    assert.equal(errorCode(Object.assign(new Error('Not found'), { code: 'ENOENT' })), 'ENOENT');
    assert.equal(errorCode(Object.assign(new Error('Exited'), { code: 128 })), 128);
  });

  it('returns undefined for an error without a code of a string or a number, and for a value that is no error', () => {
    assert.equal(errorCode(new Error('Plain')), undefined);
    assert.equal(errorCode(Object.assign(new Error('Odd'), { code: true })), undefined);
    assert.equal(errorCode({ code: 'ENOENT' }), undefined);
  });
});

describe('errorMessage', () => {
  it('returns the message of an error, or the value as a string', () => {
    assert.equal(errorMessage(new Error('The disk is full')), 'The disk is full');
    assert.equal(errorMessage('Plain text'), 'Plain text');
    assert.equal(errorMessage(42), '42');
  });
});
