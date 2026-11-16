import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GrammarState, ThemedToken } from 'shiki/core';
import { highlighterOf, type LanguageHighlighter, languageOfPath } from '@/lib/code-highlight.ts';
import { addBatch, type ColorBatch, colorSides, hunkSidesOf } from '@/review/file-highlight.ts';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * One call of the highlighter: the code it colored, and the grammar state it read on from.
 */
interface HighlightCall {
  readonly code: string;
  readonly state: GrammarState | undefined;
}

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
 * Returns the changes of a file at `path` with the hunks `hunks`.
 */
const file = (path: string, ...hunks: readonly DiffHunk[]): FileDiff => ({
  status: 'modified',
  oldPath: path,
  newPath: path,
  path,
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
 * Returns every batch that `colorSides` sends for the sides `sides` with the highlighter `colorer`.
 */
const batchesOf = (colorer: LanguageHighlighter, sides: readonly (readonly string[])[]): ColorBatch[] => {
  const batches: ColorBatch[] = [];
  colorSides(colorer, sides, (batch) => batches.push(batch));
  return batches;
};

/**
 * Returns the colors of the lines of `target` with a real highlighter of TypeScript, as the worker colors them.
 */
const colorTypeScript = async (target: FileDiff): Promise<Map<DiffLine, readonly ThemedToken[]>> => {
  const loader = languageOfPath(target.path);
  assert.notEqual(loader, undefined);
  const real = await highlighterOf(loader as NonNullable<typeof loader>);
  const sides = hunkSidesOf(target);
  const colors = new Map<DiffLine, readonly ThemedToken[]>();
  colorSides(
    real,
    sides.map((side) => side.map(({ text }) => text)),
    (batch) => addBatch(colors, sides, batch),
  );
  return colors;
};

describe('hunkSidesOf', () => {
  it('splits each hunk into its old side and then its new side', () => {
    const shared = line('context', 'a');
    const deleted = line('delete', 'b');
    const added = line('add', 'B');
    assert.deepEqual(hunkSidesOf(file('a.ts', { header: '@@', lines: [shared, deleted, added] })), [
      [shared, deleted],
      [shared, added],
    ]);
  });

  it('skips a side without lines', () => {
    const first = line('add', 'one');
    const second = line('delete', 'two');
    assert.deepEqual(hunkSidesOf(file('a.ts', { header: '@@', lines: [first] }, { header: '@@', lines: [second] })), [
      [first],
      [second],
    ]);
  });
});

describe('colorSides', () => {
  it('colors each side as one piece of code', () => {
    const calls: HighlightCall[] = [];
    batchesOf(highlighter('#fff', calls), [
      ['a', 'b'],
      ['a', 'B'],
    ]);
    assert.deepEqual(
      calls.map((call) => call.code),
      ['a\nb', 'a\nB'],
    );
  });

  it('sends the colors of each side with its index and the index of its first line', () => {
    assert.deepEqual(batchesOf(highlighter('#fff'), [['a'], ['b', 'c']]), [
      { side: 0, start: 0, tokens: [[token('a', '#fff')]] },
      { side: 1, start: 0, tokens: [[token('b', '#fff')], [token('c', '#fff')]] },
    ]);
  });

  it('colors a side of more than 200 lines in runs that read on from the state where the run before ended', () => {
    const calls: HighlightCall[] = [];
    // The highlighter of the test never reads the state, so a plain object stands in for one.
    const ending = {} as GrammarState;
    const texts = Array.from({ length: 401 }, (_, index) => `line ${index}`);
    const batches = batchesOf(highlighter('#fff', calls, ending), [texts]);
    assert.deepEqual(
      batches.map(({ start, tokens }) => [start, tokens.length]),
      [
        [0, 200],
        [200, 200],
        [400, 1],
      ],
    );
    assert.deepEqual(
      calls.map((call) => call.state),
      [undefined, ending, ending],
    );
  });

  it('starts each side from the start of the grammar', () => {
    const calls: HighlightCall[] = [];
    batchesOf(highlighter('#fff', calls, {} as GrammarState), [['a'], ['b']]);
    assert.deepEqual(
      calls.map((call) => call.state),
      [undefined, undefined],
    );
  });

  it('stops a side at a line that holds a line break of its own, and colors the next side', () => {
    const batches = batchesOf(highlighter('#fff'), [['x\ny'], ['B']]);
    assert.deepEqual(batches, [{ side: 1, start: 0, tokens: [[token('B', '#fff')]] }]);
  });

  it('colors every line of a block comment that spans more than one run', async () => {
    const lines = [
      line('add', '/* start'),
      ...Array.from({ length: 450 }, (_, index) => line('add', `  const inside${index} = 1;`)),
      line('add', '*/'),
      line('add', 'const after = 1;'),
    ];
    const colors = await colorTypeScript(file('a.ts', { header: '@@', lines }));
    const comment = colors.get(lines[0] as DiffLine)?.[0]?.color;
    assert.notEqual(comment, undefined);
    for (const inside of lines.slice(0, -1)) {
      assert.deepEqual(
        colors.get(inside)?.map(({ color }) => color),
        [comment],
      );
    }
    assert.notDeepEqual(
      colors.get(lines.at(-1) as DiffLine)?.map(({ color }) => color),
      [comment],
    );
  });

  it('gives a line longer than 1,000 characters one color', async () => {
    const long = line('add', `const long = '${'a'.repeat(1500)}';`);
    const colors = await colorTypeScript(file('a.ts', { header: '@@', lines: [long] }));
    assert.equal(colors.get(long)?.length, 1);
  });

  it('colors every line of a file of more than 5,000 lines', async () => {
    const lines = Array.from({ length: 6000 }, (_, index) => line('add', `export const value${index} = ${index};`));
    const colors = await colorTypeScript(file('a.ts', { header: '@@', lines }));
    assert.equal(colors.size, 6000);
    assert.equal((colors.get(lines[5999] as DiffLine)?.length ?? 0) > 1, true);
  });
});

describe('addBatch', () => {
  it('sets the colors of the lines of the batch from the index of its first line', () => {
    const lines = [line('add', 'a'), line('add', 'b'), line('add', 'c')];
    const colors = new Map<DiffLine, readonly ThemedToken[]>();
    addBatch(colors, [lines], { side: 0, start: 1, tokens: [[token('b', 'x')], [token('c', 'y')]] });
    assert.deepEqual(
      [...colors.entries()],
      [
        [lines[1], [token('b', 'x')]],
        [lines[2], [token('c', 'y')]],
      ],
    );
  });

  it('keeps the colors of the new side for a line that both sides share', () => {
    const shared = line('context', 'a');
    const target = file('a.ts', { header: '@@', lines: [shared] });
    const sides = hunkSidesOf(target);
    const colors = new Map<DiffLine, readonly ThemedToken[]>();
    for (const batch of batchesOf(highlighter('old'), [['a']])) addBatch(colors, sides, batch);
    addBatch(colors, sides, { side: 1, start: 0, tokens: [[token('a', 'new')]] });
    assert.deepEqual(colors.get(shared), [token('a', 'new')]);
  });

  it('ignores a batch of a side or a line that the file does not hold', () => {
    const colors = new Map<DiffLine, readonly ThemedToken[]>();
    const sides = [[line('add', 'a')]];
    addBatch(colors, sides, { side: 3, start: 0, tokens: [[token('a', 'x')]] });
    addBatch(colors, sides, { side: 0, start: 1, tokens: [[token('a', 'x')]] });
    assert.equal(colors.size, 0);
  });
});
