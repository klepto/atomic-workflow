import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTask, parseTicketId } from './claude-tool-result.ts';

/**
 * Prefix that Claude Code gives the tools of the MCP server `atomic-workflow`.
 */
const PREFIX = 'mcp__plugin_atomic-workflow_atomic-workflow__';

/**
 * Line of a Claude Code transcript, with the value of its JSON.
 */
interface Line {
  /**
   * Text of the line.
   */
  readonly text: string;

  /**
   * Value of the JSON of the line.
   */
  readonly value: object;
}

/**
 * Returns the line of the entry of the agent that calls the tool `tool` of the MCP server in the call `id`.
 */
const call = (id: string, tool: string): Line => {
  const value = { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `${PREFIX}${tool}` }] } };
  return { text: JSON.stringify(value), value };
};

/**
 * Returns the line of the entry of the result of the call `id`, with the value `answer` as its JSON text, and the
 * fields of `fields` on the result.
 */
const result = (id: string, answer: unknown, fields: object = {}): Line => {
  const content = [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }];
  const value = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, ...fields }] } };
  return { text: JSON.stringify(value), value };
};

/**
 * Returns what `parse` finds in each line of `lines`, in their order, with one map of the calls.
 */
const parseAll = <T>(
  parse: (line: string, value: unknown, calls: Map<string, string>) => T,
  lines: readonly Line[],
): readonly T[] => {
  const calls = new Map<string, string>();
  return lines.map(({ text, value }) => parse(text, value, calls));
};

describe('parseTask', () => {
  it('returns the task of the result of taskCreate as created', () => {
    const lines = [call('call-1', 'taskCreate'), result('call-1', { id: 9, slug: 'cache-layer', status: 'goals' })];
    assert.deepEqual(parseAll(parseTask, lines), [undefined, { taskId: 9, created: true }]);
  });

  it('returns the task of the result of taskGet as read', () => {
    const lines = [call('call-1', 'taskGet'), result('call-1', { id: 9, slug: 'cache-layer' })];
    assert.deepEqual(parseAll(parseTask, lines)[1], { taskId: 9, created: false });
  });

  it('returns undefined for a failed call', () => {
    const lines = [call('call-1', 'taskGet'), result('call-1', 'Task 9 not found', { is_error: true })];
    assert.equal(parseAll(parseTask, lines)[1], undefined);
  });

  it('returns undefined for a result that holds no task', () => {
    const lines = [call('call-1', 'taskGet'), result('call-1', 'Task 9 not found')];
    assert.equal(parseAll(parseTask, lines)[1], undefined);
  });

  it('returns undefined for the result of another tool', () => {
    const lines = [call('call-1', 'taskList'), result('call-1', { id: 9, slug: 'cache-layer' })];
    assert.equal(parseAll(parseTask, lines)[1], undefined);
  });

  it('returns undefined for a result without its call, and for a second result of one call', () => {
    const lines = [
      result('call-1', { id: 9, slug: 'cache-layer' }),
      call('call-2', 'taskGet'),
      result('call-2', { id: 9, slug: 'cache-layer' }),
      result('call-2', { id: 9, slug: 'cache-layer' }),
    ];
    assert.deepEqual(parseAll(parseTask, lines), [undefined, undefined, { taskId: 9, created: false }, undefined]);
  });

  it('returns undefined for a value that is no entry', () => {
    assert.equal(parseTask(`{"name":"${PREFIX}taskGet"`, undefined, new Map()), undefined);
  });
});

describe('parseTicketId', () => {
  it('returns the id of the ticket of the result of worktreeCreate', () => {
    const lines = [call('call-1', 'worktreeCreate'), result('call-1', { worktrees: {}, ticket: { id: 6, slug: 'x' } })];
    assert.deepEqual(parseAll(parseTicketId, lines), [undefined, 6]);
  });

  it('returns undefined for a failed call', () => {
    const lines = [call('call-1', 'worktreeCreate'), result('call-1', { ticket: { id: 6 } }, { is_error: true })];
    assert.equal(parseAll(parseTicketId, lines)[1], undefined);
  });

  it('returns undefined for a result that holds no ticket', () => {
    const lines = [call('call-1', 'worktreeCreate'), result('call-1', 'Another session works on the ticket')];
    assert.equal(parseAll(parseTicketId, lines)[1], undefined);
  });

  it('returns undefined for the result of another tool', () => {
    const lines = [call('call-1', 'worktreeMerge'), result('call-1', { ticket: { id: 6 } })];
    assert.equal(parseAll(parseTicketId, lines)[1], undefined);
  });
});
