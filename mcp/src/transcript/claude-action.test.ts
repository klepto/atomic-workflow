import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAction } from './claude-action.ts';

/**
 * Time of the entries of the tests.
 */
const TIMESTAMP = '2026-10-31T10:00:00.000Z';

/**
 * Returns an entry of the agent in a Claude Code transcript with the content `content`, and the fields of `fields`
 * on top.
 */
const entry = (content: unknown, fields: object = {}): object => ({
  type: 'assistant',
  timestamp: TIMESTAMP,
  message: { content },
  ...fields,
});

/**
 * Returns the block of a call of the tool `name` with the input `input`.
 */
const toolUse = (name: string, input: object = {}): object => ({ type: 'tool_use', name, input });

/**
 * Returns the action that `parseAction` finds in the line of the entry `value`, with `sidechain`, or `undefined`.
 */
const actionOf = (value: object, sidechain = false): string | null | undefined =>
  parseAction(JSON.stringify(value), value, sidechain)?.action;

describe('parseAction', () => {
  it('returns the call of a tool with its main argument and the time of the entry', () => {
    const value = entry([toolUse('Bash', { description: 'Run the tests', command: 'npm test' })]);
    assert.deepEqual(parseAction(JSON.stringify(value), value, false), {
      action: 'Bash: npm test',
      timestamp: Date.parse(TIMESTAMP),
    });
  });

  it('names the main argument of each known tool', () => {
    assert.equal(actionOf(entry([toolUse('Read', { limit: '10', file_path: '/a.ts' })])), 'Read: /a.ts');
    assert.equal(actionOf(entry([toolUse('Grep', { path: '/src', pattern: 'TODO' })])), 'Grep: TODO');
    assert.equal(actionOf(entry([toolUse('Skill', { args: '9 6', skill: 'implement' })])), 'Skill: implement');
  });

  it('names the first text of the input of an unknown tool', () => {
    assert.equal(actionOf(entry([toolUse('taskGet', { count: 3, task: '9' })])), 'taskGet: 9');
  });

  it('names a tool without a text in its input by its name only', () => {
    assert.equal(actionOf(entry([toolUse('taskList', { count: 3 })])), 'taskList');
    assert.equal(actionOf(entry([{ type: 'tool_use', name: 'taskList' }])), 'taskList');
  });

  it('writes each line break of the argument as a space', () => {
    assert.equal(
      actionOf(entry([toolUse('Bash', { command: 'cd mcp\nnpm test\r\nnpm run build' })])),
      'Bash: cd mcp npm test npm run build',
    );
  });

  it('cuts an action to 200 characters with an ellipsis', () => {
    const action = actionOf(entry([toolUse('Bash', { command: 'a'.repeat(300) })]));
    assert.equal(action, `Bash: ${'a'.repeat(193)}…`);
    assert.equal(action?.length, 200);
  });

  it('returns null for an entry whose last block is a text', () => {
    assert.equal(actionOf(entry([toolUse('Bash', { command: 'npm test' }), { type: 'text', text: 'Done' }])), null);
    assert.equal(actionOf(entry('Done')), null);
  });

  it('returns the last call when it follows a text', () => {
    const value = entry([{ type: 'text', text: 'Next' }, toolUse('Read', { file_path: '/a.ts' })]);
    assert.equal(actionOf(value), 'Read: /a.ts');
  });

  it('returns undefined for an entry without a call and with blank text only', () => {
    assert.equal(actionOf(entry([{ type: 'text', text: '  ' }])), undefined);
    assert.equal(actionOf(entry([{ type: 'thinking', thinking: 'Hmm' }])), undefined);
  });

  it('counts the entries of a subagent with sidechain only', () => {
    const value = entry([toolUse('Bash', { command: 'npm test' })], { isSidechain: true });
    assert.equal(actionOf(value, false), undefined);
    assert.equal(actionOf(value, true), 'Bash: npm test');
  });

  it('skips an entry that only Claude Code wrote, and the summary of a compaction', () => {
    assert.equal(actionOf(entry('Done', { isMeta: true })), undefined);
    assert.equal(actionOf(entry('Done', { isCompactSummary: true })), undefined);
  });

  it('skips an entry of the user', () => {
    const value = { type: 'user', timestamp: TIMESTAMP, message: { content: 'assistant' } };
    assert.equal(actionOf(value), undefined);
  });

  it('skips a line that is no entry of the agent', () => {
    assert.equal(parseAction('{"type":"assistant"', undefined, false), undefined);
  });
});
