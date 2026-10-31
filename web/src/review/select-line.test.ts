import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Selection, selectLine } from '@/review/select-line.ts';

/**
 * Selection of the new lines `start` to `end` of the file `a.ts` that started at the line `origin`.
 */
const selection = (start: number, end: number, origin: number | null = start): Selection => ({
  path: 'a.ts',
  origin,
  anchor: { kind: 'lines', side: 'new', start, end },
});

describe('selectLine', () => {
  it('selects the line alone with no selection before', () => {
    assert.deepEqual(selectLine(undefined, 'a.ts', 'new', 4, true), selection(4, 4));
  });

  it('selects the line alone without extend', () => {
    assert.deepEqual(selectLine(selection(2, 3), 'a.ts', 'new', 7, false), selection(7, 7));
  });

  it('extends the selection down from the line it started at', () => {
    assert.deepEqual(selectLine(selection(2, 2), 'a.ts', 'new', 5, true), selection(2, 5, 2));
  });

  it('extends the selection up from the line it started at', () => {
    assert.deepEqual(selectLine(selection(5, 8, 5), 'a.ts', 'new', 3, true), selection(3, 5, 5));
  });

  it('selects the line alone when it lies in another file', () => {
    assert.deepEqual(selectLine(selection(2, 2), 'b.ts', 'new', 5, true), {
      path: 'b.ts',
      origin: 5,
      anchor: { kind: 'lines', side: 'new', start: 5, end: 5 },
    });
  });

  it('selects the line alone when it lies on the other side', () => {
    assert.deepEqual(selectLine(selection(2, 2), 'a.ts', 'old', 5, true), {
      path: 'a.ts',
      origin: 5,
      anchor: { kind: 'lines', side: 'old', start: 5, end: 5 },
    });
  });

  it('selects the line alone after a selection of the whole file', () => {
    const file: Selection = { path: 'a.ts', origin: null, anchor: { kind: 'file' } };
    assert.deepEqual(selectLine(file, 'a.ts', 'new', 5, true), selection(5, 5));
  });
});
