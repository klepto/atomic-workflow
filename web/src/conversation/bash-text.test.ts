import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBash } from '@/conversation/bash-text.ts';

describe('parseBash', () => {
  it('parses a command without the whitespace around it', () => {
    assert.deepEqual(parseBash('<bash-input> git status </bash-input>'), { command: 'git status', output: undefined });
  });

  it('keeps the line breaks inside a command', () => {
    assert.deepEqual(parseBash('<bash-input>ls\npwd</bash-input>'), { command: 'ls\npwd', output: undefined });
  });

  it('parses an output with its standard output and its standard error', () => {
    const text = '<bash-stdout>Removing a.js\nRemoving b.js\n</bash-stdout><bash-stderr>warning</bash-stderr>';
    assert.deepEqual(parseBash(text), {
      command: undefined,
      output: { stdout: 'Removing a.js\nRemoving b.js', stderr: 'warning' },
    });
  });

  it('parses an output with empty streams', () => {
    assert.deepEqual(parseBash('<bash-stdout></bash-stdout><bash-stderr></bash-stderr>'), {
      command: undefined,
      output: { stdout: '', stderr: '' },
    });
  });

  it('parses an output with only one stream', () => {
    assert.deepEqual(parseBash('<bash-stderr>failed</bash-stderr>'), {
      command: undefined,
      output: { stdout: '', stderr: 'failed' },
    });
  });

  it('parses a command with its output, in any order', () => {
    assert.deepEqual(parseBash('<bash-stdout>ok</bash-stdout>\n<bash-input>ls</bash-input>'), {
      command: 'ls',
      output: { stdout: 'ok', stderr: '' },
    });
  });

  it('returns undefined for a text with more than the tags', () => {
    assert.equal(parseBash('<bash-input>ls</bash-input> and more'), undefined);
    assert.equal(parseBash('See <bash-stdout>ok</bash-stdout>'), undefined);
  });

  it('returns undefined for a text without the tags', () => {
    assert.equal(parseBash('run git status'), undefined);
    assert.equal(parseBash(''), undefined);
  });
});
