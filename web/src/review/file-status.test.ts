import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FILE_STATUSES } from '@/review/file-status.ts';

describe('FILE_STATUSES', () => {
  it('names each status of a file', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(FILE_STATUSES).map(([status, look]) => [status, look.words])), {
      added: 'Added',
      deleted: 'Deleted',
      modified: 'Modified',
      renamed: 'Renamed',
      copied: 'Copied',
    });
  });

  it('gives each status an icon of its own', () => {
    const icons = Object.values(FILE_STATUSES).map((look) => look.icon);
    assert.equal(new Set(icons).size, icons.length);
  });
});
