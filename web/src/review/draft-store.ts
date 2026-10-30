import { localStorageBrowserStore } from '@/lib/browser-store.local-storage.ts';
import { EMPTY_DRAFT, isEmptyDraft, type ReviewDraft } from '@/review/review-draft.ts';

/**
 * Returns the key of the entry of the browser store that holds the review of the ticket `ticketId` of the task
 * `taskId`.
 */
const storageKeyOf = (taskId: number, ticketId: number): string => `atomic-workflow:review:${taskId}:${ticketId}`;

/**
 * Returns the value of the JSON text `text`. If `text` is not JSON, returns `undefined` instead.
 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // A stored review that is not JSON is lost, and the review starts empty.
    return undefined;
  }
};

/**
 * Returns the review of the ticket `ticketId` of the task `taskId` that the browser store holds. If it holds none, or
 * nothing it can read, returns an empty review instead.
 */
export const readDraft = (taskId: number, ticketId: number): ReviewDraft => {
  const stored = localStorageBrowserStore.read(storageKeyOf(taskId, ticketId));
  const parsed = stored === undefined ? undefined : parseJson(stored);
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_DRAFT;
  return {
    comments: 'comments' in parsed && Array.isArray(parsed.comments) ? parsed.comments : [],
    overall: 'overall' in parsed && typeof parsed.overall === 'string' ? parsed.overall : '',
  };
};

/**
 * Keeps the review `draft` of the ticket `ticketId` of the task `taskId` in the browser store, or removes it there
 * when it holds no comment. A store that refuses the write, such as a full one, keeps the review in the page only,
 * until the page closes.
 */
export const writeDraft = (taskId: number, ticketId: number, draft: ReviewDraft): void => {
  const key = storageKeyOf(taskId, ticketId);
  if (isEmptyDraft(draft)) localStorageBrowserStore.remove(key);
  else localStorageBrowserStore.write(key, JSON.stringify(draft));
};
