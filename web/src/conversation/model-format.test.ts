import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatModel } from '@/conversation/model-format.ts';

describe('formatModel', () => {
  it('shows the family and the version of a model identifier', () => {
    assert.equal(formatModel('claude-opus-5-5'), 'Opus 5.5');
  });

  it('shows a version with one number', () => {
    assert.equal(formatModel('claude-sonnet-4'), 'Sonnet 4');
  });

  it('reads an identifier with the version before the family', () => {
    assert.equal(formatModel('claude-3-5-sonnet-20241022'), 'Sonnet 3.5');
  });

  it('leaves out the release date', () => {
    assert.equal(formatModel('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  });

  it('returns a model that is no Claude model as it is', () => {
    assert.equal(formatModel('gpt-5'), 'gpt-5');
  });

  it('returns an identifier without a version or with two families as it is', () => {
    assert.equal(formatModel('claude-opus'), 'claude-opus');
    assert.equal(formatModel('claude-opus-fast-5'), 'claude-opus-fast-5');
    assert.equal(formatModel('claude-5'), 'claude-5');
  });
});
