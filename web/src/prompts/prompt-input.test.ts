import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promptInputOf } from '@/prompts/prompt-input.ts';

describe('promptInputOf', () => {
  it('shows the command of a call of Bash as a command', () => {
    assert.deepEqual(promptInputOf('Bash', { command: 'npm test', description: 'Run the tests' }), {
      kind: 'command',
      text: 'npm test',
    });
  });

  it('shows the input of any other tool as JSON indented by 2 spaces', () => {
    assert.deepEqual(promptInputOf('Edit', { file_path: 'C:/repo/a.ts', replace_all: false }), {
      kind: 'json',
      text: '{\n  "file_path": "C:/repo/a.ts",\n  "replace_all": false\n}',
    });
  });

  it('shows the input of a call of Bash without a command as a string as JSON', () => {
    assert.deepEqual(promptInputOf('Bash', { command: 3 }), { kind: 'json', text: '{\n  "command": 3\n}' });
  });

  it('shows an input that JSON cannot hold as an empty text', () => {
    assert.deepEqual(promptInputOf('mcp__server__tool', undefined), { kind: 'json', text: '' });
  });
});
