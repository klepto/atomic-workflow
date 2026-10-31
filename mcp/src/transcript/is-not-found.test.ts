import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNotFound } from './is-not-found.ts';

/**
 * Returns an `Error` with the message `message` and the code `code`, as a file operation of Node.js fails.
 */
const fileError = (message: string, code: string): Error => Object.assign(new Error(message), { code });

describe('isNotFound', () => {
  it('returns true for the failure of a path that does not exist', () => {
    assert.equal(isNotFound(fileError('No such file', 'ENOENT')), true);
  });

  it('returns false for the failure of another code', () => {
    assert.equal(isNotFound(fileError('Permission denied', 'EACCES')), false);
  });

  it('returns false for an Error without a code and for a value that is no Error', () => {
    assert.equal(isNotFound(new Error('No such file')), false);
    assert.equal(isNotFound({ code: 'ENOENT' }), false);
  });
});
