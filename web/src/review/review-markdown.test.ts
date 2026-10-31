import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommentAnchor } from '@/review/comment-anchor.ts';
import type { DiffLine, FileDiff } from '@/review/patch.ts';
import type { ReviewComment } from '@/review/review-draft.ts';
import { reviewMarkdown } from '@/review/review-markdown.ts';
import type { ReviewFile } from '@/review/use-changes.ts';

/**
 * Returns a line of a hunk of the kind `kind` with the text `text` and its numbers.
 */
const line = (kind: DiffLine['kind'], oldNumber: number | null, newNumber: number | null, text: string): DiffLine => ({
  kind,
  oldNumber,
  newNumber,
  text,
  noNewline: false,
});

/**
 * Returns the changes of the file `path` with the fields that a test states, modified with no hunks otherwise.
 */
const file = (path: string, fields: Partial<FileDiff> = {}): FileDiff => ({
  status: 'modified',
  oldPath: path,
  newPath: path,
  path,
  similarity: null,
  modeChange: null,
  binary: false,
  hunks: [],
  additions: 0,
  deletions: 0,
  ...fields,
});

/**
 * Returns the file of the review whose lines `diff` loaded, with the summary that `diff` gives.
 */
const reviewFile = (diff: FileDiff): ReviewFile => ({
  summary: {
    path: diff.path,
    oldPath: diff.oldPath,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
    binary: diff.binary,
    generated: false,
    patch: '',
  },
  lines: { state: 'loaded', diff, longLines: false },
});

/**
 * Returns the comment `body` on the file `path` at the anchor `anchor`.
 */
const comment = (path: string, anchor: CommentAnchor, body: string): ReviewComment => ({
  id: `${path}:${body}`,
  path,
  anchor,
  body,
});

/**
 * Changes of `a.ts`: its second line replaced, between two shared lines.
 */
const MODIFIED = file('a.ts', {
  hunks: [
    {
      header: '@@ -1,3 +1,3 @@',
      lines: [
        line('context', 1, 1, 'one'),
        line('delete', 2, null, 'two'),
        line('add', null, 2, 'TWO'),
        line('context', 3, 3, 'three'),
      ],
    },
  ],
  additions: 1,
  deletions: 1,
});

describe('reviewMarkdown', () => {
  it('turns the overall comment and the line comments on both sides into Markdown, by file and by first line', () => {
    const renamed = file('b.ts', { status: 'renamed', oldPath: 'old/b.ts', similarity: 100 });
    const draft = {
      overall: ' Looks good.\n',
      comments: [
        comment('a.ts', { kind: 'lines', side: 'new', start: 2, end: 3 }, 'Check this.'),
        comment('b.ts', { kind: 'file' }, 'Moved.'),
        comment('a.ts', { kind: 'lines', side: 'old', start: 1, end: 2 }, 'Why delete?\n'),
      ],
    };
    assert.equal(
      reviewMarkdown(draft, [reviewFile(MODIFIED), reviewFile(renamed)], '0123456789abcdef'),
      [
        'Reviewed commit `0123456`.',
        '',
        '### Overall',
        '',
        'Looks good.',
        '',
        '### `a.ts`, lines 1 to 2 (old)',
        '',
        '```diff',
        ' one',
        '-two',
        '```',
        '',
        'Why delete?',
        '',
        '### `a.ts`, lines 2 to 3',
        '',
        '```diff',
        '+TWO',
        ' three',
        '```',
        '',
        'Check this.',
        '',
        '### `b.ts`, the whole file',
        '',
        'Renamed from `old/b.ts`, 0 lines added and 0 deleted.',
        '',
        'Moved.',
      ].join('\n'),
    );
  });

  it('leaves out the commit when it is null and an overall comment of white space only', () => {
    const draft = {
      overall: '  ',
      comments: [comment('a.ts', { kind: 'lines', side: 'new', start: 2, end: 2 }, 'Hm')],
    };
    assert.equal(reviewMarkdown(draft, [reviewFile(MODIFIED)], null), '### `a.ts`, line 2\n\n```diff\n+TWO\n```\n\nHm');
  });

  it('names the change of the mode of a file in a comment on the whole file', () => {
    const changed = file('run.sh', { modeChange: { old: '100644', new: '100755' } });
    const draft = { overall: '', comments: [comment('run.sh', { kind: 'file' }, 'Why?')] };
    assert.equal(
      reviewMarkdown(draft, [reviewFile(changed)], null),
      '### `run.sh`, the whole file\n\nModified, mode 100644 to 100755, 0 lines added and 0 deleted.\n\nWhy?',
    );
  });

  it('names a deleted file by its status and counts alone in a comment on the whole file', () => {
    const deleted = file('old.ts', { status: 'deleted', newPath: null, deletions: 4 });
    const draft = { overall: '', comments: [comment('old.ts', { kind: 'file' }, 'Still used?')] };
    assert.equal(
      reviewMarkdown(draft, [reviewFile(deleted)], null),
      '### `old.ts`, the whole file\n\nDeleted, 0 lines added and 4 deleted.\n\nStill used?',
    );
  });

  it('keeps the order in which comments that start at the same line were added', () => {
    const anchor: CommentAnchor = { kind: 'lines', side: 'new', start: 2, end: 2 };
    const draft = { overall: '', comments: [comment('a.ts', anchor, 'First'), comment('a.ts', anchor, 'Second')] };
    const excerpt = '```diff\n+TWO\n```';
    assert.equal(
      reviewMarkdown(draft, [reviewFile(MODIFIED)], null),
      `### \`a.ts\`, line 2\n\n${excerpt}\n\nFirst\n\n### \`a.ts\`, line 2\n\n${excerpt}\n\nSecond`,
    );
  });

  it('fences lines that hold backticks with a longer fence', () => {
    const fenced = file('a.md', {
      hunks: [{ header: '@@ -0,0 +1 @@', lines: [line('add', null, 1, '```ts')] }],
      additions: 1,
    });
    const draft = { overall: '', comments: [comment('a.md', { kind: 'lines', side: 'new', start: 1, end: 1 }, 'Ok')] };
    assert.equal(
      reviewMarkdown(draft, [reviewFile(fenced)], null),
      '### `a.md`, line 1\n\n````diff\n+```ts\n````\n\nOk',
    );
  });

  it('leaves out the excerpt of lines that the changes do not hold', () => {
    const draft = {
      overall: '',
      comments: [comment('a.ts', { kind: 'lines', side: 'new', start: 9, end: 9 }, 'Gone')],
    };
    assert.equal(reviewMarkdown(draft, [reviewFile(MODIFIED)], null), '### `a.ts`, line 9\n\nGone');
  });

  it('leaves out a comment on a file that the changes do not hold', () => {
    const draft = { overall: 'All fine', comments: [comment('gone.ts', { kind: 'file' }, 'Lost')] };
    assert.equal(reviewMarkdown(draft, [reviewFile(MODIFIED)], null), '### Overall\n\nAll fine');
  });

  it('returns an empty text for an empty review with no commit', () => {
    assert.equal(reviewMarkdown({ overall: '', comments: [] }, [reviewFile(MODIFIED)], null), '');
  });
});
