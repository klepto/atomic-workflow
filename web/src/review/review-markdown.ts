import { anchorWords, type CommentAnchor } from '@/review/comment-anchor.ts';
import { FILE_STATUSES } from '@/review/file-status.ts';
import { type DiffSide, type FileDiff, numberOn, signOf } from '@/review/patch.ts';
import type { ReviewComment, ReviewDraft } from '@/review/review-draft.ts';

/**
 * Returns the first line of the anchor `anchor`, or 0 for a file anchor, which comes first.
 */
const startOf = (anchor: CommentAnchor): number => (anchor.kind === 'file' ? 0 : anchor.start);

/**
 * Returns one sentence that says what the change did to the file `file`, such as `Renamed from \`a.ts\`.`.
 */
const fileWords = (file: FileDiff): string => {
  const moved = file.oldPath !== null && file.oldPath !== file.path ? ` from \`${file.oldPath}\`` : '';
  const mode = file.modeChange === null ? '' : `, mode ${file.modeChange.old} to ${file.modeChange.new}`;
  const { words } = FILE_STATUSES[file.status];
  return `${words}${moved}${mode}, ${file.additions} lines added and ${file.deletions} deleted.`;
};

/**
 * Returns the lines of the file `file` whose number on the side `side` lies from `start` to `end`, each with its sign,
 * with the added and the deleted lines between them, one per line.
 */
const excerptOf = (file: FileDiff, side: DiffSide, start: number, end: number): string => {
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  const first = lines.findIndex((line) => numberOn(line, side) === start);
  const last = lines.findLastIndex((line) => numberOn(line, side) === end);
  if (first === -1 || last === -1) return '';
  return lines
    .slice(first, last + 1)
    .map((line) => `${signOf(line)}${line.text}`)
    .join('\n');
};

/**
 * Returns the text `text` in a fenced code block of the language `language`, with a fence longer than any run of
 * backticks in `text`.
 */
const fenced = (text: string, language: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${text}\n${fence}`;
};

/**
 * Returns the comment `comment` on the file `file` as Markdown: a heading with the path of the file and the lines of
 * the comment, the move of a renamed file, the lines it points at as a diff, and its text.
 */
const commentMarkdown = (comment: ReviewComment, file: FileDiff): string => {
  const parts = [`### \`${file.path}\`, ${anchorWords(comment.anchor)}`];
  if (comment.anchor.kind === 'file') {
    parts.push(fileWords(file));
  } else {
    const excerpt = excerptOf(file, comment.anchor.side, comment.anchor.start, comment.anchor.end);
    if (excerpt !== '') parts.push(fenced(excerpt, 'diff'));
  }
  parts.push(comment.body.trim());
  return parts.join('\n\n');
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
