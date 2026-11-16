import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exitCodeOf, formatMeasure, longestTaskOf, type Measure, measuresOf, type RawMeasures } from './measures.ts';

/**
 * Returns raw measures that meet every budget, with the fields of `overrides`.
 */
const raw = (overrides: Partial<RawMeasures> = {}): RawMeasures => ({
  longestTask: 10,
  clickDelay: 10,
  frames: [16, 16, 16],
  ...overrides,
});

/**
 * Returns the measure named `name` of `measures`.
 */
const measureNamed = (measures: readonly Measure[], name: string): Measure => {
  const measure = measures.find((candidate) => candidate.name === name);
  assert.ok(measure !== undefined, `no measure ${name}`);
  return measure;
};

/**
 * Returns the trace of Chrome with the events `events`, as `stopTracing` gives it.
 */
const trace = (events: readonly object[]): string => JSON.stringify({ traceEvents: events });

/**
 * Returns the metadata event that names the thread `tid` of the process `pid` `name`.
 */
const threadName = (pid: number, tid: number, name: string): object => ({
  name: 'thread_name',
  ph: 'M',
  pid,
  tid,
  args: { name },
});

/**
 * Returns a complete event `name` of `dur` µs on the thread `tid` of the process `pid`.
 */
const task = (pid: number, tid: number, dur: number, name = 'RunTask'): object => ({ name, ph: 'X', pid, tid, dur });

describe('measuresOf', () => {
  it('gives the four measures in the order that the check prints them', () => {
    assert.deepEqual(
      measuresOf(raw()).map((measure) => measure.name),
      ['longest task', 'click to selection', 'frames over 20 ms', 'longest frame'],
    );
  });

  it('passes a longest task of 50 ms and fails one over 50 ms', () => {
    assert.equal(measureNamed(measuresOf(raw({ longestTask: 50 })), 'longest task').passes, true);
    assert.equal(measureNamed(measuresOf(raw({ longestTask: 50.5 })), 'longest task').passes, false);
  });

  it('passes a click delay of 100 ms and fails one over 100 ms', () => {
    assert.equal(measureNamed(measuresOf(raw({ clickDelay: 100 })), 'click to selection').passes, true);
    assert.equal(measureNamed(measuresOf(raw({ clickDelay: 101 })), 'click to selection').passes, false);
  });

  it('gives the share of the frames over 20 ms in percent, and passes it only under 5 %', () => {
    const under = measureNamed(measuresOf(raw({ frames: [...Array(99).fill(16), 30] })), 'frames over 20 ms');
    assert.equal(under.value, 1);
    assert.equal(under.passes, true);
    const at = measureNamed(measuresOf(raw({ frames: [...Array(19).fill(16), 30] })), 'frames over 20 ms');
    assert.equal(at.value, 5);
    assert.equal(at.passes, false);
  });

  it('does not count a frame of exactly 20 ms as over 20 ms', () => {
    assert.equal(measureNamed(measuresOf(raw({ frames: [20, 20] })), 'frames over 20 ms').value, 0);
  });

  it('gives the longest frame, and passes it up to 50 ms', () => {
    const passing = measureNamed(measuresOf(raw({ frames: [16, 50, 17] })), 'longest frame');
    assert.equal(passing.value, 50);
    assert.equal(passing.passes, true);
    assert.equal(measureNamed(measuresOf(raw({ frames: [16, 51] })), 'longest frame').passes, false);
  });

  it('gives no slow frame and a longest frame of 0 ms for a scroll without frames', () => {
    const measures = measuresOf(raw({ frames: [] }));
    assert.equal(measureNamed(measures, 'frames over 20 ms').value, 0);
    assert.equal(measureNamed(measures, 'longest frame').value, 0);
  });
});

describe('formatMeasure', () => {
  it('prints a time in whole ms with its budget', () => {
    const [longestTask] = measuresOf(raw({ longestTask: 38.4 }));
    assert.ok(longestTask !== undefined);
    assert.equal(formatMeasure(longestTask), 'longest task: 38 ms (budget 50 ms)');
  });

  it('prints a share in percent with one decimal', () => {
    const share = measureNamed(measuresOf(raw({ frames: [...Array(78).fill(16), 30, 30] })), 'frames over 20 ms');
    assert.equal(formatMeasure(share), 'frames over 20 ms: 2.5 % (budget 5 %)');
  });
});

describe('exitCodeOf', () => {
  it('gives 0 when every measure meets its budget', () => {
    assert.equal(exitCodeOf(measuresOf(raw())), 0);
  });

  it('gives 1 when one measure misses its budget', () => {
    assert.equal(exitCodeOf(measuresOf(raw({ clickDelay: 250 }))), 1);
    assert.equal(exitCodeOf(measuresOf(raw({ frames: [16, 60] }))), 1);
  });
});

describe('longestTaskOf', () => {
  it('gives the longest task of a renderer main thread in ms', () => {
    const events = [threadName(1, 10, 'CrRendererMain'), task(1, 10, 12_000), task(1, 10, 38_500), task(1, 10, 900)];
    assert.equal(longestTaskOf(trace(events)), 38.5);
  });

  it('ignores the tasks of other threads, such as a worker or the browser', () => {
    const events = [
      threadName(1, 10, 'CrRendererMain'),
      threadName(1, 11, 'DedicatedWorker thread'),
      threadName(2, 20, 'CrBrowserMain'),
      task(1, 10, 5000),
      task(1, 11, 900_000),
      task(2, 20, 800_000),
    ];
    assert.equal(longestTaskOf(trace(events)), 5);
  });

  it('ignores events other than RunTask', () => {
    const events = [threadName(1, 10, 'CrRendererMain'), task(1, 10, 4000), task(1, 10, 700_000, 'FunctionCall')];
    assert.equal(longestTaskOf(trace(events)), 4);
  });

  it('takes the tasks of every renderer main thread, such as after a swap of the process on navigation', () => {
    const events = [
      threadName(1, 10, 'CrRendererMain'),
      threadName(3, 30, 'CrRendererMain'),
      task(1, 10, 4000),
      task(3, 30, 61_000),
    ];
    assert.equal(longestTaskOf(trace(events)), 61);
  });

  it('reads a trace that is a bare array of events', () => {
    assert.equal(longestTaskOf(JSON.stringify([threadName(1, 10, 'CrRendererMain'), task(1, 10, 7000)])), 7);
  });

  it('gives 0 ms for a trace without tasks', () => {
    assert.equal(longestTaskOf(trace([threadName(1, 10, 'CrRendererMain')])), 0);
  });
});
