import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseJson, textOf } from './claude-entry.ts';

describe('parseJson', () => {
  it('returns the value of a valid JSON text', () => {
    assert.deepEqual(parseJson('{"type":"user","count":2}'), { type: 'user', count: 2 });
  });

  it('returns undefined for a text that is not valid JSON', () => {
    assert.equal(parseJson('{"type":'), undefined);
  });
});

describe('textOf', () => {
  it('returns a text content as it is', () => {
    assert.equal(textOf('Hello'), 'Hello');
  });

  it('joins the text blocks of a content with an empty line, and skips the other blocks', () => {
    const content = [
      { type: 'text', text: 'First' },
      { type: 'tool_use' },
      { type: 'thinking', text: 'Hidden' },
      { type: 'text', text: 'Second' },
    ];
    assert.equal(textOf(content), 'First\n\nSecond');
  });

  it('returns an empty text for a content without text blocks', () => {
    assert.equal(textOf([{ type: 'tool_use' }]), '');
  });
});
