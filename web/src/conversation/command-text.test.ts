import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCommand } from '@/conversation/command-text.ts';

describe('parseCommand', () => {
  it('parses a typed command without arguments', () => {
    assert.deepEqual(parseCommand('/clear'), { name: '/clear', args: '' });
  });

  it('parses a typed command with its arguments, without the whitespace around them', () => {
    assert.deepEqual(parseCommand('  /plan   3 cache  \n'), { name: '/plan', args: '3 cache' });
  });

  it('keeps the line breaks inside the arguments of a typed command', () => {
    assert.deepEqual(parseCommand('/plan 3\nmore'), { name: '/plan', args: '3\nmore' });
  });

  it('drops the plugin from the name of a typed command', () => {
    assert.deepEqual(parseCommand('/atomic-workflow:implement 9 9'), { name: '/implement', args: '9 9' });
  });

  it('parses the tags of a command in the transcript', () => {
    const text =
      '<command-message>plan</command-message>\n<command-name>/plan</command-name>\n<command-args>3</command-args>';
    assert.deepEqual(parseCommand(text), { name: '/plan', args: '3' });
  });

  it('parses the tags of a command in any order, with a name without a slash and without the plugin', () => {
    const text = '<command-args> 9 9 </command-args><command-name>atomic-workflow:implement</command-name>';
    assert.deepEqual(parseCommand(text), { name: '/implement', args: '9 9' });
  });

  it('parses the tags of a command without arguments', () => {
    assert.deepEqual(parseCommand('<command-name>/clear</command-name>'), { name: '/clear', args: '' });
  });

  it('returns undefined for tags with text around them', () => {
    assert.equal(parseCommand('<command-name>/clear</command-name> and more'), undefined);
  });

  it('returns undefined for tags without a name', () => {
    assert.equal(parseCommand('<command-args>3</command-args>'), undefined);
    assert.equal(parseCommand('<command-name> </command-name>'), undefined);
  });

  it('returns undefined for a text that runs no command', () => {
    assert.equal(parseCommand('Plan the task'), undefined);
    assert.equal(parseCommand('/'), undefined);
    assert.equal(parseCommand(''), undefined);
  });
});
