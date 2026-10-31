import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STATUS_WORDS } from '@/tickets/status-words.ts';

describe('STATUS_WORDS', () => {
  it('names each status of a ticket by its own words', () => {
    assert.deepEqual(STATUS_WORDS, {
      'not-started': 'Not started',
      'in-progress': 'In progress',
      'needs-review': 'Needs review',
      blocked: 'Blocked',
      done: 'Done',
    });
  });
});
