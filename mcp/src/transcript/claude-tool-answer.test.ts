import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createToolAnswerWatch, isAnsweredBy, readEarlierLines, type ToolCall } from './claude-tool-answer.ts';

/**
 * Tool call that the tests watch.
 */
const CALL: ToolCall = { toolName: 'Bash', toolInput: { command: 'npm test', description: 'Run the tests' } };

/**
 * Returns the line of the entry of the agent that calls the tool `name` with the input `input` in the call `id`.
 */
const toolUse = (id: string, input: unknown = CALL.toolInput, name = CALL.toolName): string =>
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });

/**
 * Returns the line of the entry of the result of the call `id`.
 */
const toolResult = (id: string): string =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'done' }] } });

/**
 * Returns the line of the entry of an interrupt of the user, with the text `text` as a text block, or as the whole
 * content when `asString` is true.
 */
const interrupt = (text = '[Request interrupted by user for tool use]', asString = false): string =>
  JSON.stringify({ type: 'user', message: { content: asString ? text : [{ type: 'text', text }] } });

describe('isAnsweredBy', () => {
  it('returns true for a result of a pending call with the same tool and input', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1')], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), true);
  });

  it('returns true for a call and its result that both come after the start', () => {
    const watch = createToolAnswerWatch();
    assert.equal(isAnsweredBy([toolUse('call-1')], CALL, watch), false);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), true);
  });

  it('matches the input whatever the order of its keys', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1', { description: 'Run the tests', command: 'npm test' })], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), true);
  });

  it('returns false for a result of a call that had its result before the start', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1'), toolResult('call-1')], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), false);
  });

  it('returns false for a repeat of a call that had its result before the start', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1'), toolResult('call-1')], CALL, watch);
    assert.equal(isAnsweredBy([toolUse('call-1'), toolResult('call-1')], CALL, watch), false);
  });

  it('returns false for a result of a call of the same tool with another input while one with the same input waits', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1', { command: 'ls' }), toolUse('call-2')], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), false);
    assert.equal(isAnsweredBy([toolResult('call-2')], CALL, watch), true);
  });

  it('returns true for a result of a call of the same tool with another input when none has the same input', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1', { command: 'npm  test' })], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), true);
  });

  it('returns false for a result of a call of another tool', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1', CALL.toolInput, 'Read')], CALL, watch);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), false);
  });

  it('returns true for an interrupt in a text block', () => {
    assert.equal(isAnsweredBy([interrupt()], CALL, createToolAnswerWatch()), true);
  });

  it('returns true for an interrupt as the whole content of a message', () => {
    assert.equal(isAnsweredBy([interrupt('[Request interrupted by user]', true)], CALL, createToolAnswerWatch()), true);
  });

  it('returns false for an interrupt that came before the start', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([interrupt(), toolUse('call-1')], CALL, watch);
    assert.equal(isAnsweredBy([toolUse('call-2', { command: 'ls' })], CALL, watch), false);
  });

  it('returns false for a record of an API request that repeats a call and its result', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1')], CALL, watch);
    const record = JSON.stringify({
      type: 'api-request-blob',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'call-1' },
          { type: 'text', text: '[Request interrupted by user]' },
        ],
      },
    });
    assert.equal(isAnsweredBy([record], CALL, watch), false);
    assert.equal(isAnsweredBy([toolResult('call-1')], CALL, watch), true);
  });

  it('returns false for a line that is no JSON or no message', () => {
    const watch = createToolAnswerWatch();
    readEarlierLines([toolUse('call-1')], CALL, watch);
    assert.equal(
      isAnsweredBy(['{"tool_result"', JSON.stringify({ type: 'user', tool_result: 1 })], CALL, watch),
      false,
    );
  });
});

describe('readEarlierLines', () => {
  it('keeps each call of the tool without a result pending, with whether its input is the same', () => {
    const watch = createToolAnswerWatch();
    const lines = [toolUse('call-1'), toolUse('call-2', { command: 'ls' }), toolUse('call-3'), toolResult('call-3')];
    readEarlierLines(lines, CALL, watch);
    assert.deepEqual(
      [...watch.pending],
      [
        ['call-1', true],
        ['call-2', false],
      ],
    );
  });
});
