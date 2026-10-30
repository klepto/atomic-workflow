import type { Ticket } from '@/api/types.ts';

/**
 * Words that the app names each status of a ticket by.
 */
export const STATUS_WORDS: Readonly<Record<Ticket['status'], string>> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'needs-review': 'Needs review',
  blocked: 'Blocked',
  done: 'Done',
};
