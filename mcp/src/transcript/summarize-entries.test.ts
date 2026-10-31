import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TranscriptActivity, TranscriptEntry, TranscriptUsage } from './find-transcript.ts';
import { summarizeEntries } from './summarize-entries.ts';

/**
 * Returns a line of a transcript with the facets of `facets`, and no other facet.
 */
const entry = (facets: Partial<TranscriptEntry>): TranscriptEntry => ({
  message: undefined,
  skills: undefined,
  activity: undefined,
  action: undefined,
  usage: undefined,
  task: undefined,
  ticketId: undefined,
  ...facets,
});

/**
 * Returns the line of a transcript that shows the status `status` at the time `timestamp`.
 */
const status = (value: TranscriptActivity['status'], timestamp: number): TranscriptEntry =>
  entry({ activity: { status: value, timestamp } });

/**
 * Returns the token usage of `contextTokens` tokens at the time `timestamp`.
 */
const usage = (contextTokens: number, timestamp: number): TranscriptUsage => ({
  contextTokens,
  model: 'claude-opus-5-5',
  effort: null,
  timestamp,
});

describe('summarizeEntries', () => {
  it('returns the first status and each status that differs from the one before', () => {
    const entries = [status('working', 10), status('working', 20), status('idle', 30), status('working', 40)];
    assert.deepEqual(summarizeEntries(entries, 0).statusChanges, [
      { status: 'working', timestamp: 10 },
      { status: 'idle', timestamp: 30 },
      { status: 'working', timestamp: 40 },
    ]);
  });

  it('skips the statuses from before the start of the log', () => {
    const entries = [status('working', 10), status('idle', 20), status('idle', 30), entry({}), status('working', 40)];
    assert.deepEqual(summarizeEntries(entries, 25).statusChanges, [
      { status: 'idle', timestamp: 30 },
      { status: 'working', timestamp: 40 },
    ]);
  });

  it('returns the action of the last entry with an action from the start of the log on', () => {
    const entries = [
      entry({ action: { action: 'Read: a.ts', timestamp: 30 } }),
      entry({ action: { action: null, timestamp: 40 } }),
      entry({}),
    ];
    assert.deepEqual(summarizeEntries(entries, 0).action, { action: null, timestamp: 40 });
  });

  it('returns no action when every action is from before the start of the log', () => {
    const entries = [entry({ action: { action: 'Read: a.ts', timestamp: 10 } })];
    assert.equal(summarizeEntries(entries, 20).action, undefined);
  });

  it('returns the usage of the last entry with a usage, from before the start of the log too', () => {
    const entries = [entry({ usage: usage(100, 10) }), entry({ usage: usage(200, 20) }), entry({})];
    assert.deepEqual(summarizeEntries(entries, 50).usage, usage(200, 20));
  });

  it('returns no status, no action and no usage for no entries', () => {
    assert.deepEqual(summarizeEntries([], 0), { statusChanges: [], action: undefined, usage: undefined });
  });
});
