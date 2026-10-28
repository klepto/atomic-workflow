import { useCallback, useState } from 'react';
import type { DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * A side of a diff: `old` for the lines before the change, `new` for the lines after it.
 */
export type DiffSide = 'old' | 'new';

/**
 * What a comment of a review points at: a whole file, such as a file that was only moved, or a run of lines of one
 * side of a file, from `start` to `end`, both included.
 */
export type CommentAnchor = { kind: 'file' } | { kind: 'lines'; side: DiffSide; start: number; end: number };

/**
 * A comment of a review on a file of the changes.
 */
export interface ReviewComment {
  /**
   * Identifier of the comment, unique in its review.
   */
  id: string;

  /**
   * Path that names the file, `FileDiff.path`.
   */
  path: string;

  /**
   * What the comment points at in the file.
   */
  anchor: CommentAnchor;

  /**
   * Text of the comment, in Markdown.
   */
  body: string;
}

/**
 * The review of a ticket that the user writes before they send it: their comments on the files, and their overall
 * comment.
 */
export interface ReviewDraft {
  /**
   * The comments on the files, in the order they were added.
   */
  comments: readonly ReviewComment[];

  /**
   * The overall comment on the changes, or an empty string for none.
   */
  overall: string;
}

/**
 * A review with no comment.
 */
export const EMPTY_DRAFT: ReviewDraft = { comments: [], overall: '' };

/**
 * Returns the key of the local storage that holds the review of the ticket `ticketId` of the task `taskId`.
 */
const storageKeyOf = (taskId: number, ticketId: number) => `atomic-workflow:review:${taskId}:${ticketId}`;

/**
 * Returns the review of the ticket `ticketId` of the task `taskId` that the local storage holds, or an empty review
 * when it holds none, or nothing it can read.
 */
const readDraft = (taskId: number, ticketId: number): ReviewDraft => {
  try {
    const stored = window.localStorage.getItem(storageKeyOf(taskId, ticketId));
    if (stored === null) return EMPTY_DRAFT;
    const parsed = JSON.parse(stored) as Partial<ReviewDraft>;
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      overall: typeof parsed.overall === 'string' ? parsed.overall : '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
};

/**
 * Stores `draft` as the review of the ticket `ticketId` of the task `taskId` in the local storage, or removes it there
 * when it holds no comment. A storage that refuses the write, such as a full one, keeps the review in the page only.
 */
const writeDraft = (taskId: number, ticketId: number, draft: ReviewDraft): void => {
  const key = storageKeyOf(taskId, ticketId);
  try {
    if (isEmptyDraft(draft)) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // The review stays in the page, and is lost only when the page closes.
  }
};

/**
 * Returns whether `draft` holds no comment and no overall comment.
 */
export const isEmptyDraft = (draft: ReviewDraft): boolean => draft.comments.length === 0 && draft.overall.trim() === '';

/**
 * Returns the review of the ticket `ticketId` of the task `taskId`, kept in the local storage of the browser so that it
 * outlives a reload, with the function that changes it. `update` takes a function from the current review to the next
 * one, and stores the next one. An empty review leaves the storage.
 */
export const useReviewDraft = (
  taskId: number,
  ticketId: number,
): [ReviewDraft, (change: (draft: ReviewDraft) => ReviewDraft) => void] => {
  const [state, setState] = useState(() => ({ taskId, ticketId, draft: readDraft(taskId, ticketId) }));
  const current =
    state.taskId === taskId && state.ticketId === ticketId
      ? state
      : { taskId, ticketId, draft: readDraft(taskId, ticketId) };
  if (current !== state) setState(current);
  const update = useCallback(
    (change: (draft: ReviewDraft) => ReviewDraft) =>
      setState((previous) => {
        const draft = change(previous.draft);
        writeDraft(previous.taskId, previous.ticketId, draft);
        return { ...previous, draft };
      }),
    [],
  );
  return [current.draft, update];
};

/**
 * Returns a new identifier of a comment.
 */
export const newCommentId = (): string => crypto.randomUUID();

/**
 * Returns the number of the line `line` on the side `side`, or `null` when the line has no number on that side.
 */
export const numberOn = (line: DiffLine, side: DiffSide): number | null =>
  side === 'old' ? line.oldNumber : line.newNumber;

/**
 * Returns the side that a click on the line `line` in the unified view points at: `old` for a deleted line, `new` for
 * every other line.
 */
export const sideOf = (line: DiffLine): DiffSide => (line.kind === 'delete' ? 'old' : 'new');

/**
 * Returns whether the anchor `anchor` covers the number `number` of the side `side`.
 */
export const covers = (anchor: CommentAnchor, side: DiffSide, number: number | null): boolean =>
  anchor.kind === 'lines' && number !== null && anchor.side === side && number >= anchor.start && number <= anchor.end;

/**
 * Returns the words that name the lines of `anchor`, such as `line 4` or `lines 4 to 9`, with `(old)` for the lines
 * before the change, or `the whole file` for a file anchor.
 */
export const anchorWords = (anchor: CommentAnchor): string => {
  if (anchor.kind === 'file') return 'the whole file';
  const lines = anchor.start === anchor.end ? `line ${anchor.start}` : `lines ${anchor.start} to ${anchor.end}`;
  return anchor.side === 'old' ? `${lines} (old)` : lines;
};

/**
 * Returns the review `draft` of the changes `files` of the commit `commit` as Markdown, for the description of the
 * ticket that makes the changes: the commit first, unless `commit` is `null`, then the overall comment, then each
 * comment by its file in the order of `files` and by its first line, each under a heading that names its file and its
 * lines, with the lines it points at as a diff.
 */
export const reviewMarkdown = (draft: ReviewDraft, files: readonly FileDiff[], commit: string | null): string => {
  const parts = commit === null ? [] : [`Reviewed commit \`${commit.slice(0, 7)}\`.`];
  if (draft.overall.trim() !== '') parts.push(`### Overall\n\n${draft.overall.trim()}`);
  for (const file of files) {
    const comments = draft.comments
      .filter((comment) => comment.path === file.path)
      .sort((first, second) => startOf(first.anchor) - startOf(second.anchor));
    for (const comment of comments) parts.push(commentMarkdown(comment, file));
  }
  return parts.join('\n\n');
};

/**
 * Returns the first line of `anchor`, or 0 for a file anchor, which comes first.
 */
const startOf = (anchor: CommentAnchor): number => (anchor.kind === 'file' ? 0 : anchor.start);

/**
 * Returns the comment `comment` on the file `file` as Markdown: a heading with the path of the file and the lines of
 * the comment, the move of a renamed file, the lines it points at as a diff, and its text.
 */
const commentMarkdown = (comment: ReviewComment, file: FileDiff): string => {
  const parts = [`### \`${file.path}\`, ${anchorWords(comment.anchor)}`];
  if (comment.anchor.kind === 'file') parts.push(fileWords(file));
  else {
    const excerpt = excerptOf(file, comment.anchor.side, comment.anchor.start, comment.anchor.end);
    if (excerpt !== '') parts.push(fenced(excerpt, 'diff'));
  }
  parts.push(comment.body.trim());
  return parts.join('\n\n');
};

/**
 * Returns one sentence that says what the change did to the file `file`, such as `Renamed from \`a.ts\`.`.
 */
const fileWords = (file: FileDiff): string => {
  const moved = file.oldPath !== null && file.oldPath !== file.path ? ` from \`${file.oldPath}\`` : '';
  const words = { added: 'Added', deleted: 'Deleted', modified: 'Modified', renamed: 'Renamed', copied: 'Copied' };
  const mode = file.modeChange === null ? '' : `, mode ${file.modeChange.old} to ${file.modeChange.new}`;
  return `${words[file.status]}${moved}${mode}, ${file.additions} lines added and ${file.deletions} deleted.`;
};

/**
 * Returns the lines of `file` whose number on the side `side` lies from `start` to `end`, each with its sign, with the
 * added and the deleted lines between them, one per line.
 */
const excerptOf = (file: FileDiff, side: DiffSide, start: number, end: number): string => {
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  const first = lines.findIndex((line) => numberOn(line, side) === start);
  const last = lines.findLastIndex((line) => numberOn(line, side) === end);
  if (first === -1 || last === -1) return '';
  return lines
    .slice(first, last + 1)
    .map((line) => `${line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '}${line.text}`)
    .join('\n');
};

/**
 * Returns `text` in a fenced code block of the language `language`, with a fence longer than any run of backticks in
 * `text`.
 */
const fenced = (text: string, language: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
};
