import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GrammarState, ThemedToken } from 'shiki/core';
import type { Clock } from '@/lib/clock.ts';
import type { LanguageHighlighter } from '@/lib/code-highlight.ts';
import { colorFile } from '@/review/file-highlight.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

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

/**
 * Returns the changes of a file with the hunks `hunks`.
 */
const file = (...hunks: readonly DiffHunk[]): FileDiff => ({
  status: 'modified',
  oldPath: 'a.ts',
  newPath: 'a.ts',
  path: 'a.ts',
  similarity: null,
  modeChange: null,
  binary: false,
  hunks: [...hunks],
  additions: 0,
  deletions: 0,
});

/**
 * Returns a token of the text `content` in the color `color`.
 */
const token = (content: string, color: string): ThemedToken => ({ content, offset: 0, color });

/**
 * One call of the highlighter: the code it colored, and the grammar state it read on from.
 */
interface HighlightCall {
  readonly code: string;
  readonly state: GrammarState | undefined;
}

/**
 * Returns a highlighter that colors each line of its code as one token in the color `color`, ends each piece of code
 * in the grammar state `ending`, and keeps each call in `calls`.
 */
const highlighter = (
  color: string,
  calls: HighlightCall[] = [],
  ending: GrammarState | undefined = undefined,
): LanguageHighlighter => ({
  tokenize: (code) => code.split('\n').map((text) => [token(text, color)]),
  tokenizeFrom: (code, state) => {
    calls.push({ code, state });
    return { tokens: code.split('\n').map((text) => [token(text, color)]), state: ending };
  },
});

/**
 * Returns a clock that runs each timer at once, and counts the timers in `timers`.
 */
const clock = (timers: { count: number } = { count: 0 }): Clock => ({
  now: () => 0,
  after: (_delay, run) => {
    timers.count += 1;
    run();
    return () => {};
  },
  every: () => () => {},
});

describe('colorFile', () => {
  it('colors the old and the new side of each hunk as one piece of code each', async () => {
    const calls: HighlightCall[] = [];
    const hunk = { header: '@@', lines: [line('context', 'a'), line('delete', 'b'), line('add', 'B')] };
    await colorFile(file(hunk), highlighter('#fff', calls), clock());
    assert.deepEqual(
      calls.map((call) => call.code),
      ['a\nb', 'a\nB'],
    );
  });

  it('gives each line the tokens of its place in the code of its side', async () => {
    const deleted = line('delete', 'b');
    const added = line('add', 'B');
    const colors = await colorFile(file({ header: '@@', lines: [deleted, added] }), highlighter('#fff'), clock());
    assert.deepEqual(colors.get(deleted), [token('b', '#fff')]);
    assert.deepEqual(colors.get(added), [token('B', '#fff')]);
  });

  it('keeps the colors of the new side for a line that both sides share', async () => {
    const shared = line('context', 'a');
    let side = 0;
    const colors = await colorFile(
      file({ header: '@@', lines: [shared] }),
      {
        tokenize: () => [],
        tokenizeFrom: (code) => {
          side += 1;
          return { tokens: [[token(code, side === 1 ? 'old' : 'new')]], state: undefined };
        },
      },
      clock(),
    );
    assert.deepEqual(colors.get(shared), [token('a', 'new')]);
  });

  it('leaves the lines of a side without colors when a line holds a line break of its own', async () => {
    const broken = line('delete', 'x\ny');
    const added = line('add', 'B');
    const colors = await colorFile(file({ header: '@@', lines: [broken, added] }), highlighter('#fff'), clock());
    assert.equal(colors.has(broken), false);
    assert.deepEqual(colors.get(added), [token('B', '#fff')]);
  });

  it('colors each hunk on its own and skips a side without lines', async () => {
    const calls: HighlightCall[] = [];
    await colorFile(
      file({ header: '@@', lines: [line('add', 'one')] }, { header: '@@', lines: [line('add', 'two')] }),
      highlighter('#fff', calls),
      clock(),
    );
    assert.deepEqual(
      calls.map((call) => call.code),
      ['one', 'two'],
    );
  });

  it('colors a side of more than 100 lines in chunks that read on from the state where the chunk before ended', async () => {
    const calls: HighlightCall[] = [];
    // The highlighter of the test never reads the state, so a plain object stands in for one.
    const ending = {} as GrammarState;
    const lines = Array.from({ length: 101 }, (_, index) => line('add', `line ${index}`));
    const colors = await colorFile(file({ header: '@@', lines }), highlighter('#fff', calls, ending), clock());
    assert.deepEqual(
      calls.map((call) => call.code.split('\n').length),
      [100, 1],
    );
    assert.equal(calls[0]?.state, undefined);
    assert.equal(calls[1]?.state, ending);
    assert.deepEqual(colors.get(lines[100] as DiffLine), [token('line 100', '#fff')]);
  });

  it('waits for a timer of the clock after each side and each hunk of a file', async () => {
    const timers = { count: 0 };
    await colorFile(
      file({ header: '@@', lines: [line('add', 'one')] }, { header: '@@', lines: [line('add', 'two')] }),
      highlighter('#fff'),
      clock(timers),
    );
    assert.equal(timers.count, 4);
  });
});
