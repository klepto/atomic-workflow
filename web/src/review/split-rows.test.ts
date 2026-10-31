import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiffLine } from '@/review/patch.ts';
import { splitRowsOf } from '@/review/split-rows.ts';

/**
 * Returns a line of a hunk of the kind `kind` with the text `text`.
 */
const line = (kind: DiffLine['kind'], text: string): DiffLine => ({
  kind,
  oldNumber: null,
  newNumber: null,
  text,
  noNewline: false,
});

describe('splitRowsOf', () => {
  it('puts a shared line on both sides of its row', () => {
    const shared = line('context', 'same');
    assert.deepEqual(splitRowsOf([shared]), [{ left: shared, right: shared }]);
  });

  it('pairs each deleted line with the added line at the same place of the run that follows it', () => {
    const deleted = [line('delete', 'a'), line('delete', 'b')];
    const added = [line('add', 'A'), line('add', 'B')];
    assert.deepEqual(splitRowsOf([...deleted, ...added]), [
      { left: deleted[0], right: added[0] },
      { left: deleted[1], right: added[1] },
    ]);
  });

  it('leaves the right side empty where a run deletes more lines than it adds', () => {
    const deleted = [line('delete', 'a'), line('delete', 'b')];
    const added = line('add', 'A');
    assert.deepEqual(splitRowsOf([...deleted, added]), [
      { left: deleted[0], right: added },
      { left: deleted[1], right: null },
    ]);
  });

  it('leaves the left side empty where a run adds more lines than it deletes', () => {
    const added = [line('add', 'A'), line('add', 'B')];
    assert.deepEqual(splitRowsOf(added), [
      { left: null, right: added[0] },
      { left: null, right: added[1] },
    ]);
  });

  it('ends a run at a shared line, so the runs on each side of it never pair', () => {
    const deleted = line('delete', 'a');
    const shared = line('context', 'same');
    const added = line('add', 'A');
    assert.deepEqual(splitRowsOf([deleted, shared, added]), [
      { left: deleted, right: null },
      { left: shared, right: shared },
      { left: null, right: added },
    ]);
  });

  it('returns no rows for no lines', () => {
    assert.deepEqual(splitRowsOf([]), []);
  });
});
