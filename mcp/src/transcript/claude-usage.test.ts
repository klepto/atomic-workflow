import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseUsage } from './claude-usage.ts';

/**
 * Time of the entries of the tests.
 */
const TIMESTAMP = '2026-10-31T10:00:00.000Z';

/**
 * Returns an entry of the agent in a Claude Code transcript with the message `message`, and the fields of `fields`
 * on top.
 */
const entry = (message: object, fields: object = {}): object => ({
  type: 'assistant',
  timestamp: TIMESTAMP,
  message,
  ...fields,
});

/**
 * Returns the usage that `parseUsage` finds in the line of the entry `value`, with `sidechain`.
 */
const usageOf = (value: object, sidechain = false): ReturnType<typeof parseUsage> =>
  parseUsage(JSON.stringify(value), value, sidechain);

describe('parseUsage', () => {
  it('returns the size of the context, the model and the effort of a request', () => {
    const value = entry(
      {
        model: 'claude-opus-5-5',
        usage: { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 7 },
      },
      { effort: 'xhigh' },
    );
    assert.deepEqual(usageOf(value), {
      contextTokens: 3210,
      model: 'claude-opus-5-5',
      effort: 'xhigh',
      timestamp: Date.parse(TIMESTAMP),
    });
  });

  it('counts missing cache tokens as none', () => {
    const value = entry({ model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: null } });
    assert.equal(usageOf(value)?.contextTokens, 10);
  });

  it('returns null for a missing or empty model and a missing or empty effort', () => {
    assert.deepEqual(usageOf(entry({ usage: { input_tokens: 10 } })), {
      contextTokens: 10,
      model: null,
      effort: null,
      timestamp: Date.parse(TIMESTAMP),
    });
    const value = entry({ model: '', usage: { input_tokens: 10 } }, { effort: '' });
    assert.equal(usageOf(value)?.model, null);
    assert.equal(usageOf(value)?.effort, null);
  });

  it('returns undefined for an entry that Claude Code wrote in place of a reply', () => {
    assert.equal(usageOf(entry({ model: '<synthetic>', usage: { input_tokens: 0 } })), undefined);
  });

  it('counts the entries of a subagent with sidechain only', () => {
    const value = entry({ usage: { input_tokens: 10 } }, { isSidechain: true });
    assert.equal(usageOf(value, false), undefined);
    assert.equal(usageOf(value, true)?.contextTokens, 10);
  });

  it('returns undefined for an entry that only Claude Code wrote', () => {
    assert.equal(usageOf(entry({ usage: { input_tokens: 10 } }, { isMeta: true })), undefined);
  });

  it('returns undefined for an entry of the user, an entry without usage, and an invalid usage', () => {
    assert.equal(usageOf(entry({ usage: { input_tokens: 10 } }, { type: 'user' })), undefined);
    assert.equal(usageOf(entry({ content: 'Done' })), undefined);
    assert.equal(usageOf(entry({ usage: { input_tokens: -1 } })), undefined);
  });
});
