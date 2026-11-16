import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkHolds, chunksOf, estimatedHeightOf, LINE_HEIGHT } from '@/review/diff-chunks.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * Returns a shared line with the old number `oldNumber` and the new number `newNumber`.
 */
const context = (oldNumber: number, newNumber: number): DiffLine => ({
  kind: 'context',
  oldNumber,
  newNumber,
  text: 'same',
  noNewline: false,
});

/**
 * Returns a line that the change added, with the new number `newNumber`.
 */
const added = (newNumber: number): DiffLine => ({
  kind: 'add',
  oldNumber: null,
  newNumber,
  text: 'new',
  noNewline: false,
});

/**
 * Returns a line that the change deleted, with the old number `oldNumber`.
 */
const deleted = (oldNumber: number): DiffLine => ({
  kind: 'delete',
  oldNumber,
  newNumber: null,
  text: 'old',
  noNewline: false,
});

/**
 * Returns a hunk with the header `header` and the lines `lines`.
 */
const hunk = (header: string, lines: DiffLine[]): DiffHunk => ({ header, lines });

/**
 * Returns `count` added lines with the new numbers from `first` on.
 */
const addedRun = (first: number, count: number): DiffLine[] =>
  Array.from({ length: count }, (_, index) => added(first + index));

/**
 * Returns a modified file with the hunks `hunks`.
 */
const file = (hunks: DiffHunk[]): FileDiff => ({
  status: 'modified',
  oldPath: 'a.ts',
  newPath: 'a.ts',
  path: 'a.ts',
  similarity: null,
  modeChange: null,
  binary: false,
  hunks,
  additions: 0,
  deletions: 0,
});

describe('estimatedHeightOf', () => {
  it('gives each line of the unified view the line height of 20 px', () => {
    const second = chunksOf(file([hunk('@@ -1 +1,53 @@', addedRun(1, 53))]), 'unified', 50)[1];
    assert.ok(second !== undefined);
    assert.equal(LINE_HEIGHT, 20);
    assert.equal(estimatedHeightOf(second), 3 * LINE_HEIGHT);
  });

  it('adds 24 px for each header of a hunk that the chunk starts', () => {
    const chunks = chunksOf(
      file([hunk('@@ -1 +1,2 @@', addedRun(1, 2)), hunk('@@ -10 +10,3 @@', addedRun(10, 3))]),
      'unified',
      50,
    );
    assert.deepEqual(chunks.map(estimatedHeightOf), [5 * 20 + 2 * 24]);
  });

  it('counts a header but no line for a hunk without lines', () => {
    const chunks = chunksOf(file([hunk('@@ -0,0 +0,0 @@', [])]), 'unified', 50);
    assert.deepEqual(chunks.map(estimatedHeightOf), [24]);
  });

  it('gives each row of the split view one line height, with a deleted and an added line side by side', () => {
    const lines = [context(1, 1), deleted(2), deleted(3), added(2), context(4, 3)];
    const chunks = chunksOf(file([hunk('@@ -1,4 +1,3 @@', lines)]), 'split', 50);
    assert.deepEqual(chunks.map(estimatedHeightOf), [4 * 20 + 24]);
  });

  it('gives a chunk that goes on with a hunk no height for its header', () => {
    const chunks = chunksOf(file([hunk('@@ -1 +1,120 @@', addedRun(1, 120))]), 'unified', 50);
    assert.deepEqual(chunks.map(estimatedHeightOf), [50 * 20 + 24, 50 * 20, 20 * 20]);
  });
});

describe('chunkHolds', () => {
  const chunks = chunksOf(
    file([
      hunk(
        '@@ -1,60 +1,60 @@',
        Array.from({ length: 60 }, (_, index) => context(index + 1, index + 1)),
      ),
    ]),
    'unified',
    50,
  );

  it('holds a selection of a line of the chunk', () => {
    const anchor = { kind: 'lines', side: 'new', start: 10, end: 10 } as const;
    assert.deepEqual(
      chunks.map((chunk) => chunkHolds(chunk, anchor)),
      [true, false],
    );
  });

  it('holds a run of lines in each chunk that the run covers', () => {
    const anchor = { kind: 'lines', side: 'old', start: 45, end: 55 } as const;
    assert.deepEqual(
      chunks.map((chunk) => chunkHolds(chunk, anchor)),
      [true, true],
    );
  });

  it('does not hold a run of lines outside the chunk', () => {
    const anchor = { kind: 'lines', side: 'new', start: 70, end: 80 } as const;
    assert.deepEqual(
      chunks.map((chunk) => chunkHolds(chunk, anchor)),
      [false, false],
    );
  });

  it('does not hold an anchor of the whole file', () => {
    assert.deepEqual(
      chunks.map((chunk) => chunkHolds(chunk, { kind: 'file' })),
      [false, false],
    );
  });

  it('holds a selection of an old line on the left of a row of the split view', () => {
    const lines = [deleted(1), deleted(2), added(1)];
    const [chunk] = chunksOf(file([hunk('@@ -1,2 +1 @@', lines)]), 'split', 50);
    assert.ok(chunk !== undefined);
    assert.equal(chunkHolds(chunk, { kind: 'lines', side: 'old', start: 2, end: 2 }), true);
    assert.equal(chunkHolds(chunk, { kind: 'lines', side: 'new', start: 2, end: 2 }), false);
  });

  it('holds a selection of a new line on the right of a row of the split view', () => {
    const lines = [deleted(1), added(1), added(2)];
    const [chunk] = chunksOf(file([hunk('@@ -1 +1,2 @@', lines)]), 'split', 50);
    assert.ok(chunk !== undefined);
    assert.equal(chunkHolds(chunk, { kind: 'lines', side: 'new', start: 2, end: 2 }), true);
  });
});
