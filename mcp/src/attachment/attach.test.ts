import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRepositoryServerError } from './attach.ts';

describe('NoRepositoryServerError', () => {
  it('names the address in its message and its field', () => {
    const error = new NoRepositoryServerError('/tmp/repository.sock');
    assert.equal(error.message, 'No atomic-workflow server runs at /tmp/repository.sock');
    assert.equal(error.address, '/tmp/repository.sock');
    assert.equal(error.name, 'NoRepositoryServerError');
  });

  it('keeps the error of the try to connect as its cause', () => {
    const cause = new Error('connect ENOENT');
    assert.equal(new NoRepositoryServerError('/tmp/repository.sock', { cause }).cause, cause);
  });

  it('is an Error', () => {
    assert.equal(new NoRepositoryServerError('/tmp/repository.sock') instanceof Error, true);
  });
});
