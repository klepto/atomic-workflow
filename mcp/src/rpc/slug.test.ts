import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SLUG } from './slug.ts';

describe('SLUG', () => {
  it('accepts three lowercase words joined by hyphens', () => {
    assert.equal(SLUG.safeParse('cache-layer-redis').success, true);
  });

  it('accepts words that hold digits', () => {
    assert.equal(SLUG.safeParse('oauth2-login-v3').success, true);
  });

  it('rejects two words', () => {
    assert.equal(SLUG.safeParse('cache-layer').success, false);
  });

  it('rejects four words', () => {
    assert.equal(SLUG.safeParse('cache-layer-for-redis').success, false);
  });

  it('rejects an uppercase letter', () => {
    assert.equal(SLUG.safeParse('Cache-layer-redis').success, false);
  });

  it('rejects a slug longer than 60 characters', () => {
    assert.equal(SLUG.safeParse(`${'a'.repeat(30)}-${'b'.repeat(15)}-${'c'.repeat(14)}`).success, false);
  });

  it('accepts a slug of 60 characters', () => {
    assert.equal(SLUG.safeParse(`${'a'.repeat(30)}-${'b'.repeat(15)}-${'c'.repeat(13)}`).success, true);
  });
});
