import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ThemedToken } from 'shiki/core';
import type { Clock } from '@/lib/clock.ts';
import type { FileColorer } from '@/review/file-colorer.ts';
import type { ColorBatch } from '@/review/file-highlight.ts';
import { createHighlightStore, type HighlightStore } from '@/review/highlight-store.ts';
import type { DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Clock of a test, whose time moves only with `advance`.
 */
interface TestClock extends Clock {
  /**
   * Moves the time on by `span` ms, and runs each timer that is due.
   */
  advance(span: number): void;
}

/**
 * One request to the colorer of a test, with the receiver of its batches.
 */
interface ColorCall {
  readonly path: string;
  readonly sides: readonly (readonly string[])[];
  readonly onBatch: (batch: ColorBatch) => void;
}

/**
 * Store of a test with the requests to its colorer and its clock.
 */
interface TestStore {
  readonly store: HighlightStore;
  readonly calls: ColorCall[];
  readonly clock: TestClock;
}

/**
 * Returns a clock that starts at the time 0, and runs its timers only in `advance`.
 */
const testClock = (): TestClock => {
  let time = 0;
  let timers: { at: number; run: () => void }[] = [];
  return {
    now: () => time,
    after: (delay, run) => {
      const timer = { at: time + delay, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },
    every: () => () => {},
    advance: (span) => {
      time += span;
      const due = timers.filter((timer) => timer.at <= time);
      timers = timers.filter((timer) => timer.at > time);
      for (const timer of due) timer.run();
    },
  };
};

/**
 * Returns a store whose colorer keeps each request, and whose clock moves only in the test.
 */
const testStore = (): TestStore => {
  const calls: ColorCall[] = [];
  const colorer: FileColorer = {
    color: (path, sides, onBatch) => {
      calls.push({ path, sides, onBatch });
    },
  };
  const clock = testClock();
  return { store: createHighlightStore({ colorer, clock }), calls, clock };
};

/**
 * Returns a line that the change added with the text `text`.
 */
const added = (text: string): DiffLine => ({ kind: 'add', oldNumber: null, newNumber: null, text, noNewline: false });

/**
 * Returns the changes of a file at `path` with one hunk of the lines `lines`.
 */
const file = (path: string, lines: readonly DiffLine[]): FileDiff => ({
  status: 'added',
  oldPath: path,
  newPath: path,
  path,
  similarity: null,
  modeChange: null,
  binary: false,
  hunks: [{ header: '@@', lines: [...lines] }],
  additions: lines.length,
  deletions: 0,
});

/**
 * Returns a batch that colors the lines from `start` of the first side, one token in the color `color` each.
 */
const batch = (start: number, texts: readonly string[], color = '#fff'): ColorBatch => ({
  side: 0,
  start,
  tokens: texts.map((text): ThemedToken[] => [{ content: text, offset: 0, color }]),
});

/**
 * Returns the first request of `calls`, and fails the test without one.
 */
const firstCall = (calls: readonly ColorCall[]): ColorCall => {
  const call = calls[0];
  assert.notEqual(call, undefined);
  return call as ColorCall;
};

describe('createHighlightStore', () => {
  it('returns no colors before the first batch', () => {
    const { store } = testStore();
    const target = file('a.ts', [added('a')]);
    store.subscribe(target, () => {});
    assert.equal(store.get(target), undefined);
  });

  it('sends the texts of each side of the file to the colorer on the first subscriber', () => {
    const { store, calls } = testStore();
    const target = file('src/a.ts', [added('a'), added('b')]);
    assert.equal(calls.length, 0);
    store.subscribe(target, () => {});
    assert.deepEqual(
      calls.map(({ path, sides }) => ({ path, sides })),
      [{ path: 'src/a.ts', sides: [['a', 'b']] }],
    );
  });

  it('colors a file of any number of lines', () => {
    const { store, calls } = testStore();
    const lines = Array.from({ length: 12_000 }, (_, index) => added(`line ${index}`));
    store.subscribe(file('a.ts', lines), () => {});
    assert.equal(firstCall(calls).sides[0]?.length, 12_000);
  });

  it('does not color a file whose language gets no colors', () => {
    const { store, calls, clock } = testStore();
    const target = file('LICENSE', [added('a')]);
    store.subscribe(target, () => {});
    clock.advance(1000);
    assert.equal(calls.length, 0);
    assert.equal(store.get(target), undefined);
  });

  it('shows the first batch once its timer ran, and tells the subscriber', () => {
    const { store, calls, clock } = testStore();
    const line = added('a');
    const target = file('a.ts', [line]);
    let changes = 0;
    store.subscribe(target, () => {
      changes += 1;
    });
    firstCall(calls).onBatch(batch(0, ['a'], 'red'));
    assert.equal(store.get(target), undefined);
    clock.advance(0);
    assert.equal(changes, 1);
    assert.deepEqual(store.get(target)?.get(line), [{ content: 'a', offset: 0, color: 'red' }]);
  });

  it('shows the batches that arrive within 100 ms of the last change together, 100 ms after it', () => {
    const { store, calls, clock } = testStore();
    const lines = [added('a'), added('b'), added('c')];
    const target = file('a.ts', lines);
    let changes = 0;
    store.subscribe(target, () => {
      changes += 1;
    });
    const call = firstCall(calls);
    call.onBatch(batch(0, ['a']));
    clock.advance(0);
    call.onBatch(batch(1, ['b']));
    clock.advance(50);
    call.onBatch(batch(2, ['c']));
    clock.advance(49);
    assert.equal(changes, 1);
    assert.equal(store.get(target)?.size, 1);
    clock.advance(1);
    assert.equal(changes, 2);
    assert.equal(store.get(target)?.size, 3);
  });

  it('shows each change as a new object that holds every line colored so far', () => {
    const { store, calls, clock } = testStore();
    const lines = [added('a'), added('b')];
    const target = file('a.ts', lines);
    store.subscribe(target, () => {});
    const call = firstCall(calls);
    call.onBatch(batch(0, ['a']));
    clock.advance(0);
    const first = store.get(target);
    call.onBatch(batch(1, ['b']));
    clock.advance(100);
    const second = store.get(target);
    assert.notEqual(second, first);
    assert.equal(first?.size, 1);
    assert.deepEqual([...(second?.keys() ?? [])], lines);
  });

  it('keeps the file without colors and calls no subscriber when the colorer sends no batch', () => {
    const { store, calls, clock } = testStore();
    const target = file('a.ts', [added('a')]);
    let changes = 0;
    store.subscribe(target, () => {
      changes += 1;
    });
    assert.equal(calls.length, 1);
    clock.advance(1000);
    assert.equal(changes, 0);
    assert.equal(store.get(target), undefined);
  });

  it('colors a file once, and keeps its colors for a subscriber that comes after the last one left', () => {
    const { store, calls, clock } = testStore();
    const target = file('a.ts', [added('a')]);
    const unsubscribe = store.subscribe(target, () => {});
    unsubscribe();
    firstCall(calls).onBatch(batch(0, ['a']));
    clock.advance(0);
    store.subscribe(target, () => {});
    assert.equal(calls.length, 1);
    assert.equal(store.get(target)?.size, 1);
  });

  it('calls a subscriber no more once it left', () => {
    const { store, calls, clock } = testStore();
    const target = file('a.ts', [added('a')]);
    let changes = 0;
    const unsubscribe = store.subscribe(target, () => {
      changes += 1;
    });
    unsubscribe();
    firstCall(calls).onBatch(batch(0, ['a']));
    clock.advance(0);
    assert.equal(changes, 0);
  });

  it('colors each file on its own', () => {
    const { store, calls, clock } = testStore();
    const first = file('a.ts', [added('a')]);
    const second = file('b.ts', [added('b')]);
    store.subscribe(first, () => {});
    store.subscribe(second, () => {});
    calls[1]?.onBatch(batch(0, ['b']));
    clock.advance(0);
    assert.equal(calls.length, 2);
    assert.equal(store.get(first), undefined);
    assert.equal(store.get(second)?.size, 1);
  });
});
