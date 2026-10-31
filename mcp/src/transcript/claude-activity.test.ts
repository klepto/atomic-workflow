import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseActivity } from './claude-activity.ts';

/**
 * Time of the entries of the tests.
 */
const TIMESTAMP = '2026-10-31T10:00:00.000Z';

/**
 * Returns an entry of a Claude Code transcript of the type `type` with the content `content`, and the fields of
 * `fields` on top.
 */
const entry = (type: string, content: unknown, fields: object = {}): object => ({
  type,
  uuid: 'entry-1',
  timestamp: TIMESTAMP,
  message: { content },
  ...fields,
});

/**
 * Returns an entry of a subagent of the type `type` with the content `content`, and the fields of `fields` on top.
 */
const subagentEntry = (type: string, content: unknown, fields: object = {}): object =>
  entry(type, content, { isSidechain: true, ...fields });

/**
 * Returns the status that `parseActivity` finds in the line of the entry `value`, with `sidechain`, or `undefined`.
 */
const statusOf = (value: object, sidechain = false): string | undefined =>
  parseActivity(JSON.stringify(value), value, sidechain)?.status;

describe('parseActivity', () => {
  it('shows working at the time of a message of the user', () => {
    const value = entry('user', 'Hello');
    assert.deepEqual(parseActivity(JSON.stringify(value), value, false), {
      status: 'working',
      timestamp: Date.parse(TIMESTAMP),
    });
  });

  it('shows working for an entry of the agent, a tool call and a tool result', () => {
    assert.equal(statusOf(entry('assistant', [{ type: 'text', text: 'Next' }])), 'working');
    assert.equal(statusOf(entry('assistant', [{ type: 'tool_use', id: 'call-1' }])), 'working');
    assert.equal(statusOf(entry('user', [{ type: 'tool_result', tool_use_id: 'call-1' }])), 'working');
  });

  it('shows working for an entry of the session that ends its turn', () => {
    assert.equal(
      statusOf(entry('assistant', 'Done', { message: { content: 'Done', stop_reason: 'end_turn' } })),
      'working',
    );
  });

  it('shows idle for a message of the user that marks an interrupt', () => {
    assert.equal(statusOf(entry('user', '[Request interrupted by user for tool use]')), 'idle');
  });

  it('shows no status for a local command and its output', () => {
    assert.equal(statusOf(entry('user', '<command-name>/clear</command-name>')), undefined);
    assert.equal(statusOf(entry('user', '<local-command-stdout></local-command-stdout>')), undefined);
  });

  it('shows no status for a shell command of the bash mode and its output', () => {
    assert.equal(statusOf(entry('user', '<bash-input>git status</bash-input>')), undefined);
    assert.equal(statusOf(entry('user', '<bash-stdout>clean</bash-stdout><bash-stderr></bash-stderr>')), undefined);
  });

  it('shows no status for an entry that only Claude Code wrote, or that starts no turn', () => {
    assert.equal(statusOf(entry('user', 'Skill text', { isMeta: true })), undefined);
    assert.equal(statusOf(entry('user', 'Background task done', { queueTranscriptOnly: true })), undefined);
    assert.equal(statusOf(entry('user', 'Summary', { isCompactSummary: true })), undefined);
  });

  it('shows no status for an entry of another type, or a value that is no entry', () => {
    assert.equal(statusOf(entry('system', 'Turn took 3s')), undefined);
    assert.equal(parseActivity('{"type":', undefined, false), undefined);
  });

  it('counts the entries of a subagent with sidechain only', () => {
    assert.equal(statusOf(subagentEntry('user', 'Hello'), false), undefined);
    assert.equal(statusOf(subagentEntry('user', 'Hello'), true), 'working');
    assert.equal(statusOf(entry('user', 'Hello'), true), undefined);
  });

  it('shows idle for an entry of a subagent that ends its turn', () => {
    const value = subagentEntry('assistant', 'Report', { message: { content: 'Report', stop_reason: 'end_turn' } });
    assert.equal(statusOf(value, true), 'idle');
  });

  it('shows idle for a message of a subagent that says it waits or stopped', () => {
    assert.equal(statusOf(subagentEntry('assistant', 'waiting'), true), 'idle');
    assert.equal(statusOf(subagentEntry('assistant', 'atomic-workflow:\n> stopped'), true), 'idle');
    assert.equal(
      statusOf(subagentEntry('assistant', [{ type: 'text', text: 'atomic-workflow:\r\n> waiting' }]), true),
      'idle',
    );
  });

  it('shows idle for a report of a subagent through SubagentHandback that says it waits', () => {
    const value = subagentEntry('assistant', [
      { type: 'tool_use', id: 'call-1', name: 'SubagentHandback', input: { message: ' waiting\n' } },
    ]);
    assert.equal(statusOf(value, true), 'idle');
  });

  it('shows working for a report of a subagent through SubagentHandback with another message', () => {
    const value = subagentEntry('assistant', [
      { type: 'tool_use', id: 'call-1', name: 'SubagentHandback', input: { message: 'Ready to land' } },
    ]);
    assert.equal(statusOf(value, true), 'working');
  });

  it('shows working for another message of a subagent', () => {
    assert.equal(statusOf(subagentEntry('assistant', 'Still waiting for the build'), true), 'working');
  });
});
